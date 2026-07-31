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
benefit two ways, both using mechanisms the spec already defines — no new
field, no new Wrapper, no spec change.

### Pattern A — correlate with a sibling Record via ID

If the Open/Hint URI Record and a richer sibling Record are always
scanned together (same tap, same code or code group), share the QDEF
common `ID` (key `-1`, §3's Common Headers) between them:

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
into a query parameter on the URI itself:

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

### Decision summary

| Question | Points toward |
|---|---|
| Only meaningful together with its original container? | A (ID correlation) |
| Must keep working if copied out and shared alone? | B (embed in URI) |
| Both apply — some consumers get it in-container, others might see it standalone? | Both: set `ID` **and** embed the parameter |

Like the Calendar example above, neither pattern needed a new Wrapper, a
new field-value shape, or a spec change — Pattern A is §3's `ID` field
doing its documented job, and Pattern B is a convention for what goes
*inside* the existing plain-string URI value, not a change to Open/Hint
URI's shape at all.
