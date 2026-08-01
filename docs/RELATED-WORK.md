# Related Work

QDEF did not emerge from a vacuum. This page surveys the existing formats,
standards, and proposals that occupy the same problem space — typed
multi-record containers for constrained optical or NFC channels. The goal
is to help readers situate QDEF against what came before and decide when
it offers something genuinely new vs. when an existing tool is a better
fit.

## Overview

The closest analogs fall into four groups:

| Group | Formats | Shared with QDEF | QDEF's delta |
|-------|---------|------------------|--------------|
| **NFC containers** | NDEF | Multi-record, typed payloads, MIME integration | Per-field criticality (even/odd), byte-mode QR framing, no session concept |
| **QR-specific containers** | BBQr, TagDrop | Magic header, single-scan payload, QR-targeted | Multi-type records within one scan, even/odd rule, CBOR Sequence wire format |
| **General typed-record containers** | MCAP | Magic bytes + sequence of self-describing typed records | Optical/NFC constraint target, even/odd, no indexing or seeking |
| **Binary serialization** | CBOR, MessagePack, BSON | Compact binary encoding | Not a container — these are the *encoding* QDEF uses internally (CBOR), not alternative containers |
| **Identifier/URI encodings** | GS1 Digital Link | URI/fallback-link concept, a growing need for compact structured data | Multi-record container, per-field criticality, binary (CBOR) from the wire up rather than a compression layer bolted onto text |

## NDEF (NFC Data Exchange Format)

NDEF is the incumbent standard for NFC tag payloads, defined by the NFC
Forum. It organises data into one or more *records*, each with a 3-bit
Type Name Format (TNF), a variable-length Type identifier, an optional
ID field, and a payload. NDEF messages are the closest existing answer to
QDEF's stated problem — for NFC.

**What NDEF does well:**
- Mature, widely deployed (billions of NFC tags)
- Multi-record messages with typed payloads
- Well-known Type definitions (Text, URI, Smart Poster, Signature)
- TNF mechanism lets records reference external types (MIME, absolute URI, NFC Forum RTD)

**Where NDEF does not cover QDEF's use case:**
- **No optical/QR equivalent.** NDEF is NFC-only. There is no NDEF-over-QR
  framing — the payload format assumes an NFC data exchange, not a scan.
- **No per-field criticality.** NDEF has per-record TNF/Type but no way to
  mark individual fields within a record as optional/graceful-degrade vs.
  mandatory. If a decoder knows a record's Type, it must handle every field
  or fail.
- **Binary format is NFC-tuned.** NDEF's type-length-value framing is
  optimised for the NFC digital protocol, not for byte-mode QR codes with
  strict space budgets.
- **No MIME type registration for standalone use.** QDEF registered
  `application/vnd.qdef` as a MIME type so it can be embedded inside
  NDEF itself (§2 of the spec). NDEF has no equivalent self-reference.

QDEF explicitly borrows from NDEF where it makes sense: the
`application/vnd.qdef` MIME framing, multi-record structure, and the
notion of well-known Record Types all trace back to NDEF. The novel
contribution is the extension to byte-mode QR with per-field criticality.

## BBQr (Bitcoin Burst QR)

BBQr is a container format for transmitting Bitcoin-related data (PSBTs,
transactions) through QR codes, developed by the Bitcoin community. It
uses a 4-byte magic header (`BBQr`), a single-char file-type byte, and
QR-series splitting for large payloads.

**What BBQr does well:**
- Simple, purpose-built for QR
- Multi-code series support with checksums
- Chosen by real Bitcoin wallet implementations

**Where QDEF diverges:**
- **Single file type per series.** BBQr identifies one file type per entire
  QR series — you get PSBT *or* a transaction, not multiple heterogeneous
  records in one payload. QDEF carries multiple typed Records in a single
  scan.
- **No per-field criticality.** Like NDEF, BBQr has no mechanism to mark
  individual fields as optional.
- **Alphanumeric encoding.** BBQr uses alphanumeric QR mode (base-45-like),
  not native byte mode, which limits data density and excludes binary data
  that doesn't encode cleanly to alphanumeric.
- **Bitcoin-specific.** BBQr is designed for the Bitcoin ecosystem. QDEF is
  general-purpose, with no domain tie.

QDEF and BBQr serve overlapping but distinct niches. BBQr is the better
choice for single-type Bitcoin data over multiple QR codes. QDEF is the
better choice for multi-type, general-purpose data in a single scan.

## MCAP (Robotics Log Container)

MCAP is a container format for robotics data logs, defined by Foxglove and
the robotics community. It stores a sequence of typed, timestamped records
— sensor readings, transforms, visualisations — in a single file, using a
magic-byte header and a sequence of self-describing records.

**What MCAP does well:**
- Proven "magic bytes + typed record sequence" pattern at scale
- Indexing, seeking, compression, and CRC coverage at the container level
- ROS-native type system integration

**Where QDEF diverges:**
- **Target domain.** MCAP is built for multi-gigabyte log files with
  indexing and seeking. QDEF is built for sub-kilobyte QR codes with no
  seek capability.
- **Container overhead.** MCAP's indexing, chunking, and compression
  support adds overhead that is unacceptable on a 1 KB QR code.
- **No even/odd criticality.** MCAP has no per-record-field optionality
  mechanism.
- **No NFC or optical constraint.** MCAP assumes a filesystem or a stream,
  not a scanned image.

The general pattern — magic header, then a sequence of typed records — is
well-proven across domains. QDEF applies it to the constrained optical
case, not inventing the pattern.

## TagDrop (2016 precursor)

TagDrop was a 2016 proposal by the same author (mofosyne) that first
suggested an NDEF-like binary header for QR codes. It identified the same
gap QDEF now fills — that QR codes needed a typed multi-record container
— but never advanced beyond a sketch.

**Key differences between TagDrop and QDEF:**
- TagDrop proposed a custom binary header; QDEF uses CBOR Sequences
- TagDrop had no even/odd criticality rule
- TagDrop was never prototyped as working decoder code
- TagDrop's scope was narrower (routing only, no standard Record Types)

QDEF is the first attempt to fully build out the idea TagDrop sketched:
field-tested prototype, registered MIME type, defined Record Types, and a
published specification. TagDrop is acknowledged as the conceptual
precursor; see `mofosyne/tagdrop` on GitHub for the original proposal.

## CBOR Tags (RFC 8949 §9)

CBOR's own tag mechanism (semantic tagging of data items, e.g. tag `32`
for URIs) was QDEF's original routing mechanism — every QDEF Record was
wrapped in a CBOR tag identifying its Type. This was the design for most
of the draft's early life.

**Why QDEF removed CBOR tag routing:**
- A CBOR tag wraps a *single* data item, but QDEF Records are CBOR maps
  with typed key-value fields. Routing on the tag means parsing the entire
  map before recognising the Type — exactly backwards for a constrained
  decoder that wants to skip unrecognised Records without parsing their
  contents.
- Type ID collision risk between QDEF Record Types and CBOR's own IANA tag
  registry, which QDEF cannot control.
- QDEF's current prefix-based routing (§3.1) lets a decoder read the
  compact Record prefix (1–5 bytes) to determine the Type, then skip the
  rest if unrecognised — zero CBOR parsing required for routing.

CBOR itself remains QDEF's internal encoding. Only the *tag-as-routing*
mechanism was removed.

## QR Code Structured Append

The QR code standard (ISO/IEC 18004) defines a Structured Append mode that
splits a payload across 2–16 QR symbols, each carrying a sequence number
and parity data. This is the QR standard's *own* built-in splitting
mechanism.

**Relationship to QDEF:**
- Structured Append operates below QDEF's layer — it splits the raw byte
  stream, not the logical Records. QDEF Records live inside each symbol.
- QDEF's own Split Record Type (§4.5) is an *alternative* to Structured
  Append: it splits at the Record level rather than the byte stream level,
  letting a decoder extract and act on early Records (e.g. an App Route
  URI) before the full split group arrives.
- An application can use both: Structured Append for physical symbol
  splitting across multiple QR codes, and QDEF Split within each symbol
  for logical splitting within a group of Records.

## GS1 Digital Link

[GS1 Digital Link](https://www.gs1.org/standards/gs1-digital-link) (also
standardized as ISO/IEC 18975:2024) is GS1's
web-first successor to its Application Identifier (AI) element-string
syntax — encoding product/logistics data (GTIN, batch, expiry, and so on)
as an ordinary HTTPS URL that any phone camera resolves like a link, with
an optional compression scheme that binary-encodes the AI/value pairs and
base64url-embeds them in the URI when a plain multi-segment URL gets too
long.

**What GS1 Digital Link does well:**
- Universal resolvability — no app-specific parser needed, any browser or
  QR scanner just opens the link
- A mature AI registry covering a huge range of supply-chain and retail
  identifiers
- A defined compression scheme (AI-to-binary lookup plus packed encoding,
  then base64url) for when the plain multi-segment URL form is too long
- Real production deployment across retail and logistics at enormous
  scale

**Where QDEF diverges:**
- **Not a multi-record container.** A GS1 Digital Link URL carries one
  identifier's worth of AI data. QDEF carries multiple heterogeneous typed
  Records — a URL, a payload, an app route — in a single scan.
- **No per-field criticality.** There's no even/odd-style mechanism for a
  GS1 URL consumer to skip fields it doesn't recognize gracefully; AI
  syntax and Digital Link path/query rules are fixed by the GS1 registry,
  not decoder-negotiable per field.
- **Compression is bolted on for density, not built in.** GS1's
  compression scheme is an optional escape hatch layered onto a
  fundamentally text/URL-based format. QDEF is binary (CBOR) from the
  wire up, so it never needed an equivalent retrofit.
- **Governance.** GS1 Digital Link is governed by GS1 and formalized as
  ISO/IEC 18975:2024 — an ISO/GS1 standard, not an IETF RFC, though it
  builds on RFC 3986 URI syntax underneath.

**Evolution note.** QDEF's Open/Hint URI (§4.2) is intentionally "just a
plain URL, nothing more," for the same universal-resolvability reason GS1
Digital Link chose a URL in the first place. That raises an obvious
question: could QDEF grow toward GS1's own move — packing structured data
compactly into (or alongside) that URL — without weakening the "always
works for a dumb reader" guarantee that's the entire point of Open/Hint
URI? It turns out yes, using mechanisms QDEF already has: the `ID` common
header for same-scan correlation with a sibling Record, embedding a
Record's CBOR bytes as a URL query parameter for a link that needs to
survive outside the container, or using the Record's own field keys
directly as query param names — readable and hand-editable, without
needing an app-specific naming scheme. See
[`IMPLEMENTATION-NOTES.md`](IMPLEMENTATION-NOTES.md) for all three
patterns worked out. None needs a spec change today — only reserving a
standard parameter name for the embed pattern, or adopting the optional
per-URL name-mapping field the third pattern floats, would be genuine
future additions. This whole line of exploration is an evolution
pathway, not a proposal on the table — a record of how far the existing
rules already stretch.

## Comparison Table

| Dimension | QDEF | NDEF | BBQr | MCAP | CBOR tags | GS1 Digital Link |
|-----------|------|------|------|------|-----------|-------------------|
| **Specification** | [spec](https://qdef-format.github.io/spec.html) | [NFC Forum](https://nfc-forum.org/) | [bbqr.org](https://bbqr.org/BBQr.html) | [mcap.dev](https://mcap.dev/spec) | [RFC 8949](https://www.rfc-editor.org/rfc/rfc8949) | [GS1 Digital Link](https://www.gs1.org/standards/gs1-digital-link) / ISO/IEC 18975:2024 |
| **Target channel** | QR, NFC | NFC only | QR only | File/stream | Encoding, not container | Any URL-capable scan |
| **Multi-record** | ✅ Yes | ✅ Yes | ❌ Single type per series | ✅ Yes | — | ❌ One identifier per URL |
| **Per-field criticality** | ✅ Even/odd rule | ❌ No | ❌ No | ❌ No | — | ❌ No |
| **Byte-mode encoding** | ✅ Yes | ✅ Yes | ❌ Alphanumeric | ✅ Yes | ✅ Yes | ❌ Text/URL native |
| **Magic header** | `QDEF` (4 B) | Implicit (NFC protocol) | `BBQr` (4 B) | `MCAP` (4 B) | None | None (`https://` + resolver domain) |
| **Wire format** | CBOR Sequence | Custom TLV | Custom | Custom + protobuf | CBOR item | URI (GS1 Application Identifier element string or Digital Link path/query) |
| **Splitting** | ⚠️ Specified, not yet implemented | ❌ No | ✅ Series-level | ✅ Chunk-level | ❌ No | ❌ No |
| **Compression** | ✅ Yes (Type 4, DEFLATE) | ❌ No | ❌ No | ✅ Container-level | ❌ No | ⚠️ Optional (GS1 Application-Identifier-to-binary + base64url) |
| **Reference library** | ❌ None | ✅ Platform SDKs | ✅ Reference implementations | ✅ C++/Python/TypeScript | ✅ Dozens across languages | ✅ GS1 Digital Link Toolkit + community libraries |
| **Registry governance** | Proposed, not established | NFC Forum | Informal | Foxglove | IANA | GS1 (Application Identifier registry) |
| **MIME type** | `application/vnd.qdef` (vendor) | ❌ No standalone | ❌ No | ❌ No | — | ❌ No (plain URL) |
| **Production use** | ⏳ None yet | ✅ Billions of tags | ✅ Bitcoin wallets | ✅ Robotics | ✅ Widespread | ✅ Massive retail/logistics deployment |
| **Open standard** | Personal draft (CC0) | ✅ NFC Forum specification | ✅ Open source specification | ✅ Open source specification | ✅ IETF RFC | ✅ GS1 / ISO standard (not IETF) |
