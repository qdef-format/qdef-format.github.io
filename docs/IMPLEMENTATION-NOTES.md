# QDEF — Implementation Notes

Worked examples for data shapes that don't fit the simple, flat, single-
Record cases in [`QDEF-SPEC.md`](QDEF-SPEC.md) §5. Non-normative — this
is "how would I actually design this," not "what must every
implementation do." This doc is the opposite direction from the spec —
given the spec's rules, how do you use them for something less trivial
than one Wi-Fi credential.

## A small structured field: an array of numbers

Spec §3.2 already covers this with a short example (a list of Wi-Fi
channel numbers) — a field value MAY be a bare array directly now
(`7: [1, 6, 11]`), so the short version isn't "how do I work around the
shape restriction" (there isn't one anymore) but "when would I still
choose not to." Pre-encoding as CBOR and carrying the encoded bytes as
an opaque, definite-length byte string — optionally marked with tag `24`
so generic CBOR tooling can tell it's re-parseable — is still legal and
still useful specifically when an outer decoder that doesn't recognize
this field should be able to skip it without a generic CBOR library
walking into its contents:

```
7: [1, 6, 11]         // direct: a bare array field value
7: 24(h'8301060b')    // opaque: tag 24 + a 4-byte string, whose own
                       //   bytes decode to [1, 6, 11] -- chosen when
                       //   skip-without-recursing matters more than
                       //   directness
```

The rest of this doc is that same pattern applied to something with real
design decisions attached, not just "one more field."

## Worked example: a calendar Record Type with multiple events

Say an application wants to share several calendar events (a title and a
start/end time each) on one QR code. There's no single right answer here
— four genuinely different designs are all valid QDEF, and which one to
pick depends on how the events relate to each other, not on the format.

### Option A — one field, an array of events, opaque to the core

```
Type <N>: {                          // Calendar (application-registered)
  0: h'<CBOR-encoded array of [title, start, end] tuples>'   // CRITICAL
}
```

The byte string's own contents, once independently decoded by an
application that understands Type `<N>`, are an ordinary CBOR array:

```
[["Standup", 1735689600, 1735691400], ["Lunch", 1735693200, 1735696800]]
```

37 bytes for these two events, verified against the actual encoder. A
QDEF core parser sees one opaque field of known length and skips the
whole thing at zero cost, regardless of how many events are inside it —
it never needs to know events exist as a concept.

**Use this when the events are only meaningful together** — a single
itinerary that should be accepted or rejected as one unit, where an
application has no use for "3 of my 5 events survived, 2 didn't."

### Option B — one Record per event, same Type ID, repeated in the Sequence

```
Type <N>: { 0: "Standup", 2: 1735689600, 4: 1735691400 }
Type <N>: { 0: "Lunch",   2: 1735693200, 4: 1735696800 }
```

Two ordinary, flat Records, both Type `<N>`, both appearing in the same
CBOR Sequence. No byte-string indirection anywhere — each event is
already scalar-shaped, so it needs none. An application collects every
Type-`<N>` Record it finds into its own calendar list; a generic QDEF
parser routes or skips each one individually, exactly like any other
Record, with zero Calendar-specific knowledge.

**Use this when the events are independently meaningful** — losing one
event to an unrecognized-critical-key abort, or a future version adding
one more event alongside older ones, shouldn't threaten the rest. This is
usually the better default for "multiple things" in QDEF specifically,
because repetition-in-a-Sequence is the mechanism the whole format is
already built around (§1's "here are one or more typed records in one
scan/tap") — reaching for an array field first is often reaching past a
tool QDEF already hands you for free.

### Option C — a standard format via Media Payload, if one already fits

If "calendar" here really means iCalendar (RFC 5545), §4.3's Media
Payload Record can carry it directly:

```
[ 6, { 0: "text/calendar" }, h'<raw .ics bytes>' ]   // Media Payload
```

Checked directly against the registry: `text/calendar` is **not** in
CoAP's Content-Formats table, so this uses Media Type's plain-string
fallback, not a numeric ID — still fully valid, just not the more compact
form. This option sidesteps designing a QDEF-specific event structure at
all; every field of every event lives inside the opaque `.ics` bytes,
invisible to QDEF the same way it would be for any other Media Payload.
Worth it specifically when interop with existing calendar tooling matters
more than compactness — an `.ics` file is far more verbose than either A
or B for the same two events.

### Option D — split across multiple codes, if any of the above is too big

Whichever of A/B/C is chosen, if the result doesn't fit in one physical
code, §4.1's Split Wrapper layers on top unchanged — wrap the whole
Sequence (or, for option B, wrap the felt need for "these Records must
arrive together" by grouping them under one Split `group_id`). This isn't
a fifth option so much as a reminder that splitting is orthogonal to how
the calendar itself is shaped; nothing about A/B/C changes to accommodate
it.

### Decision summary

| Question | Points toward |
|---|---|
| Should one bad/unrecognized event void the whole set? | A |
| Should events be independently droppable/skippable/extensible? | B |
| Does an existing standard format already fit? | C |
| Bigger than one code either way? | D, layered on whichever of A/B/C |

None of these needed a new wrapper, a new field-value shape, or a spec
change — they're all just applications of §3.2's field-value-shape rule,
§1's repeated-Records model, and §4.1/§4.3's existing standard record types, combined
differently depending on what the data actually needs.


## Worked example: a fallback link that's also a parseable Record

This pattern emerged from an open design discussion and isn't yet a
recommended convention — it's a demonstration that the spec already
supports it, not guidance the project has reviewed or adopted.

Open/Hint URI (§4.2) is deliberately "just a URL, nothing more" — the
whole point is that a decoder understanding nothing else in the container
still gets a working link. But an app that *does* understand more
shouldn't have to throw that context away and start a plain HTTP fetch
from scratch. GS1 Digital Link faces the same tension for its
Application-Identifier data and resolves it by compressing values
straight into the URI (see `RELATED-WORK.md`). QDEF can get the same
benefit a few ways, all using mechanisms the spec already defines or a
small, fully backward-compatible extension of them — no new Wrapper, no
change to Open/Hint URI's existing shape.

### Pattern A — correlate with a sibling Record via ID

If the Open/Hint URI Record and a richer sibling Record are always
scanned together (same tap, same code or code group), share the QDEF
common `ID` (key `-1`, §3.6's Record ID) between them:

```
Type 5:  { 0: "https://example.com/order/9F2C", -1: "order-9f2c" }  // Open/Hint URI
Type <N>: { 0: {...order fields...},            -1: "order-9f2c" }  // sibling Record
```

A generic browser or scanner ignores key `-1` entirely and just opens the
URL — it isn't part of the URI string, so §4.2's fallback guarantee is
untouched. A QDEF-aware app instead finds the sibling Record by matching
`ID` and skips the network round-trip. Nothing new here: `ID` already
exists specifically "for correlating Records within the same scan/tap"
(§3).

**Use this when the link is only meaningful inside its original
container** — a URL copied out and shared standalone loses the sibling
Record and just degrades to a plain link, which is fine if that's an
acceptable fallback.

### Pattern B — embed the Record directly in the URI

If the link needs to keep working *after* it leaves the container —
copied out of the QR code, forwarded by text, opened from browser history
days later — put the sibling Record's own CBOR bytes, base64url-encoded,
into a query parameter on the URI itself.

This is one point along an evolution pathway, not a fixed destination —
Pattern B trades legibility for density, which only matters because the
URL is also carrying QR byte-budget weight. A scanner-software developer
doesn't actually need an opaque blob to get code reuse; the Record's own
CBOR keys can just as well become the query string's keys directly,
explored as Pattern C below. Pattern B still put here first because it's
the most direct translation of GS1 Digital Link's own compression move —
whether it or Pattern C fits better depends on how much a given app's
scanner code wants readable, hand-editable query strings versus maximum
density:

```
Type 5: {
  0: "https://example.com/order?d=<base64url-CBOR-bytes-of-a-Record>"
}
```

- A plain browser sends the whole URL to the server as normal — nothing
  here requires a "Record-aware" client for the fallback to work.
- The **server** behind that domain (which minted the QDEF container in
  the first place) can decode the same parameter and render richer
  content — one encoding, so there's no risk of the URL and an embedded
  field drifting out of sync with each other.
- A QDEF-aware **app** intercepting the link (e.g. via App Route's
  domain-verified dispatch, §4.4) decodes the identical parameter
  locally, skipping the network round-trip.

This costs more bytes than Pattern A (the Record travels inside the
URL's text, subject to percent-encoding overhead) in exchange for
surviving outside the container. **The parameter name (`d` above) is not
a QDEF-reserved convention** — today this is an app-specific choice,
agreed out of band between whoever mints the link and whoever consumes
it. Reserving a standard name (so generic tooling could recognize and
decode it without app-specific knowledge) is a plausible future spec
addition, not something this pattern requires today.

### Pattern C — the sibling Record's own keys as query param names

A URL query string doesn't require identifier-like keys — digits and `-`
are unreserved characters in a URI, so a Record's own integer field keys
work verbatim as query param names, common headers included:

```
Type 5: {
  0: "https://example.com/order?2=2025-12-31&4=ABC123&-1=order-9f2c"
}
```

Any QDEF-aware decoder can translate this back into `{2: "2025-12-31",
4: "ABC123", -1: "order-9f2c"}` mechanically, with **zero knowledge of
what Type this is or what those fields mean** — the same generic,
Type-agnostic property that makes the rest of QDEF's routing work without
per-app code. That's the property an app-invented scheme like `?date=...`
never had: translating `date` back to field `2` requires knowing this
specific app's naming choice ahead of time.

**Two things this needs that a raw integer key doesn't give for free:**

- **Value serialization per CBOR type.** Integers and text strings
  translate to query-string text trivially; byte strings need a defined
  text form (hex or base64url); arrays and maps don't have an obvious
  flat `key=value` shape — those fields would need bracket/repeat
  conventions, or just fall back to Pattern B's blob for that field only
  while the rest stay as plain integer-keyed params.
- **Readable names, if wanted, are a per-URL choice, not a Record-wide
  one.** Rather than baking a name table into the Record itself (which
  would force one naming scheme on every consumer, and would need a new
  spec-governed common header to stay collision-safe — §3.6 is explicit
  that keys `≤ -2` are "not self-allocatable by an application"), an
  Open/Hint URI Record can carry its own optional
  mapping field, local to that one link: e.g. `9: {2: "date", 4:
  "batch"}` translates field `2` to `?date=...` and field `4` to
  `?batch=...` for *this* URL specifically. §4.2 already allows repeating
  Open/Hint URI once per variant ("multiple languages or URIs need no new
  mechanism") — the same repetition covers multiple destinations wanting
  different query-key naming, each correlated to the same sibling Record
  via `ID`, each with its own mapping field:

```
Type 5: { 0: "https://example.com/order?2=2025-12-31&4=ABC123",
          9: {2: "date", 4: "batch"}, -1: "order-9f2c" }   // human-readable variant
Type 5: { 0: "https://partner.example/o?2=2025-12-31&4=ABC123",
          -1: "order-9f2c" }                                // plain-integer variant, no mapping needed
```

A decoder that doesn't recognize key `9` still recovers every field by
its raw integer key — the mapping is purely optional legibility sugar,
never required to parse the URL correctly.

### Decision summary

| Question | Points toward |
|---|---|
| Only meaningful together with its original container? | A (ID correlation) |
| Must keep working if copied out and shared alone, and density matters more than legibility? | B (embed in URI) |
| Must keep working if copied out and shared alone, and hand-editable/readable query keys matter? | C (keys as query params) |
| Both apply — some consumers get it in-container, others might see it standalone? | Combine: set `ID` **and** use B or C |

Like the Calendar example above, none of these patterns needed a new
Wrapper or a new field-value shape — Pattern A is §3's `ID` field doing
its documented job, and Patterns B and C are both just conventions for
what goes *inside* the existing plain-string URI value, not a change to
Open/Hint URI's shape at all. Pattern C's optional name-mapping field
(key `9` above) is the one genuinely new field being floated here, and
even that stays fully backward compatible — odd/optional, ignorable by
any decoder that doesn't care about it — so adopting it later costs
nothing today. None of this is a proposal to change the spec; it's a
record of how far the existing rules already stretch, and where the
remaining gaps are if someone wants to standardize further.

## URI Records that reference companion Record fields

The Patterns above embed or correlate data *from* the URI record. A
complementary need: an Open/Hint URI sitting alongside an application
Record may want to open a URL *built from* the companion's field values
— e.g. a Wi-Fi credential record's SSID and password passed as query
parameters. QDEF leaves the mechanism to the application. Three
approaches are worth considering:

### Segmented array (no new syntax, still self-documenting)

Key `0` carries a CBOR array interleaving literal strings with field
references. An integer element means "substitute map key `N` from the
companion Record":

```
[100, {-1: "wifi1", 2: "My Coffee Shop", 4: "guest123"}],
[5, {0: ["https://example.com/connect?SSID=", 2, "&password=", 4],
      2: "wifi1"}]
```

The reader walks the array at key `0`, concatenating strings verbatim
and resolving integer elements against the companion record's map. An
array `[id, key]` overrides the default companion for that one reference:

```
[5, {0: ["https://example.com/connect?SSID=", 2,
         "&password=", ["wifi2", 4]],
      2: "wifi1"}]
```

Here `2` resolves against `"wifi1"` (the default), while `["wifi2", 4]`
pulls from a different Record. If every reference uses `[id, key]`
explicitly, key `2` on the map can be omitted.

### Template URI (invent-a-syntax)

The URI carries `{N}` placeholder tokens that a reader substitutes at
presentation time:

```
[100, {-1: "wifi1", 2: "My Coffee Shop", 4: "guest123"}],
[5, {0: "https://example.com/connect?SSID={2}&password={4}",
      2: "wifi1"}]
```

Borrows from string interpolation (Python f-strings, JavaScript template
literals). More compact on the wire than the segmented array, but
introduces a mini-syntax readers must agree on. The URI is fully
readable as-is.

### Mapping field (structured, no new syntax)

The URI record carries a base URI and an explicit struct describing which
companion fields to pull:

```
[100, {-1: "wifi1", 2: "My Coffee Shop", 4: "guest123"}],
[5, {0: "https://example.com/connect",
      2: "wifi1",
      4: [{2: "SSID"}, {4: "password"}] }]
```

The reader looks up the companion by its `-1` ID, then walks the array at
key 4 to build `?SSID=value&password=value`. No new syntax of any kind,
but the URI alone (`https://example.com/connect`) tells a human nothing
about what will fill it. Best when the substitution is entirely
machine-driven.

### Which to pick

The segmented array is the strongest general answer: pure CBOR, no
mini-syntax, still self-documenting. The template URI wins on compactness
when wire bytes are tight. The mapping field is best when the substitution
is opaque to a human reader. None needs a spec change.

## UUID identity without a dedicated key

A Record ID (`-1`) covers intra-container correlation with a short
string. When a tag also needs a UUID for cross-system tracking (e.g.
inventory moving between distributed scanners), wrap the content in a
UUID Record instead of adding a second identity key to every record:

```
// Container root is a UUID Record wrapping a Bundle:
37(h'<16 byte UUID>', [
  [100, {-1: "ssid", 2: "My Coffee Shop", 4: "guest123"}],
  [5, {0: "...", 2: "ssid"}]
])
```

The outer UUID gives cross-system identity; the inner records correlate
locally with short `-1` strings. Two concerns, two layers, no key-space
conflict. A scanner that only needs the UUID reads the outer wrapping;
one that only needs local correlation ignores it. No new spec machinery
required — just a Record Type carrying a 16-byte payload at key `0`,
optionally tagged with CBOR tag 37.
