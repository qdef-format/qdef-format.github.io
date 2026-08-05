# QDEF Implementations

Projects and applications using QDEF.

## TagDrop

TagDrop uses QDEF as its byte-mode container for physical delivery codes. The project's own SPEC.md documents a QDEF Record Type for route payloads and a namespace-scoped odd type ID alongside a global even type ID allocation. See [TagDrop on GitHub](https://github.com/mofosyne/tagdrop).

## Reference Implementations

[`qdef-format/qdef`](https://github.com/qdef-format/qdef) hosts QDEF's reference implementations — meant to be depended on, not thrown away after proving the design works.

### JavaScript (full design)

Container framing, Record routing (namespace/typeId/map/subrecord grammar, canonical CBOR encoding), and the full standard record type library (§4: Split, Compress, Encrypt, Open/Hint URI, Media Payload, App Route, Media Preview, Signature). Published as the `qdef` npm package. Source at [`/js`](https://github.com/qdef-format/qdef/tree/main/js).

### Rust / `no_std` (mandatory core only)

A zero-dependency, zero-copy, decode-only Rust crate for the mandatory core (§2/§3), targeting `no_std` environments including bare-metal Cortex-M0. Covers container framing, Record routing, and the even/odd criticality helper — no standard record types yet. Source at [`/rust/qdef-core`](https://github.com/qdef-format/qdef/tree/main/rust/qdef-core).

---

**Adding your project?** Open an issue or PR on [GitHub](https://github.com/qdef-format/qdef-format.github.io).
