# QDEF Record Type Examples

These are informative examples — actual QDEF payloads decoded into human-readable
Record Type definitions. Each hex string is validated by the CI suite
(via `assets/validator-examples.js` and `scripts/test-validator.js`).

> **Note:** The hex strings below can be pasted directly into the
> [online Validator](../tools/validator.html) to inspect the CBOR tree
> and generate QR codes.

## Wi-Fi + URL Bundle

A Bundle of two Records — an illustrative Wi-Fi credential (type 100) and a standard Open/Hint URI (type 10). Note: type 100 is not an assigned standard type; it serves only as a hypothetical example.

Hex: `51 44 45 46 82 82 18 64 a3 00 6e 4d 79 20 43 6f 66 66 65 65 20 53 68 6f 70 02 68 67 75 65 73 74 31 32 33 04 02 82 0a a1 00 78 1f 68 74 74 70 73 3a 2f 2f 65 78 61 6d 70 6c 65 2e 63 6f 6d 2f 63 6f 66 66 65 65 2d 6d 65 6e 75`

```js
[
  [
    100  // typeId=100 (even/global)
    {
      0: "My Coffee Shop"  // even/critical
      2: "guest123"  // even/critical
      4: 2  // even/critical
    }
  ]
  [
    10  // typeId=10 (even/global) — Open/Hint URI
    {
      0: "https://example.com/coffee-menu"  // URI (even/critical)
    }
  ]
]
```


## TagDrop Route (scoped)

A scoped Record under namespace 89d414e0 (TagDrop) with typeId=1, carrying an origin destination and an optional numeric hint.

Hex: `51 44 45 46 81 83 44 89 d4 14 e0 01 a2 00 48 53 6f 6d 65 44 65 73 74 02 01`

```js
[
  1  // typeId=1 (odd/scoped)
  // namespace: 89 d4 14 e0
  {
    0: h'536f6d6544657374'  // even/critical
    2: 1  // even/critical
  }
]
```


## Media Preview + Payload

A Media Preview (type 14, even) containing a content hash and filename via Common Field Keys, with a nested Media Payload subrecord (type 6) carrying raw text content.

Hex: `51 44 45 46 81 83 0e a3 00 6a 74 65 78 74 2f 70 6c 61 69 6e 2a 48 12 9d a0 88 d6 d3 61 bc 2e 69 68 65 6c 6c 6f 2e 74 78 74 83 06 a1 00 6a 74 65 78 74 2f 70 6c 61 69 6e 58 1a 48 65 6c 6c 6f 20 66 72 6f 6d 20 54 61 67 44 72 6f 70 20 43 6f 6e 74 65 6e 74`

```js
[
  14  // typeId=14 (even/global) — Media Preview
  {
    0: "text/plain"  // Media Type (even/critical)
    -11: h'129da088d6d361bc'  // Content Hash (odd/optional)
    -15: "hello.txt"  // Filename (odd/optional)
  }
  [
    6  // typeId=6 (even/global) — Media Payload
    {
      0: "text/plain"  // Media Type (even/critical)
    }
    h'48 65 6c 6c 6f 20 66 72 6f 6d 20 54 61 67 44 72 ...'  // payload (26 B)
  ]
]
```


## TagDrop Content Extension

A scoped Record (typeId=1) under namespace 89d414e0 with three extension fields — a text hint, a text description, and a small binary payload.

Hex: `51 44 45 46 81 83 44 89 d4 14 e0 01 a3 03 64 68 69 6e 74 0b 6b 64 65 73 63 72 69 70 74 69 6f 6e 0d 42 01 02`

```js
[
  1  // typeId=1 (odd/scoped)
  // namespace: 89 d4 14 e0
  {
    3: "hint"  // odd/optional
    11: "description"  // odd/optional
    13: h'0102'  // odd/optional
  }
]
```


## Single URL (global typeId=10)

A minimal Open/Hint URI Record (type 10, even) with just a URL field — no optional hints or labels.

Hex: `51 44 45 46 81 82 0a a1 00 78 18 68 74 74 70 73 3a 2f 2f 65 78 61 6d 70 6c 65 2e 63 6f 6d 2f 71 64 65 66`

```js
[
  10  // typeId=10 (even/global) — Open/Hint URI
  {
    0: "https://example.com/qdef"  // URI (even/critical)
  }
]
```


## Empty Bundle (typeId=0, no subrecords)

The smallest valid QDEF payload — a Bundle containing zero Records.

Hex: `51 44 45 46 80`

```js
[]     // Bundle (implicit typeId=0), empty
```


## Invalid: no magic header (intentionally broken)

A payload missing the QDEF magic header — the validator falls back to raw CBOR parsing and reports the mismatch.

Hex: `00 01 02 03 81 01`

*This payload is intentionally malformed to test validator error handling.*

```js
00 01 02 03 81 01
```

*Not a valid QDEF Bundle.*

