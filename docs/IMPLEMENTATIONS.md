# QDEF Implementations

Projects and applications using QDEF.

## TagDrop

TagDrop uses QDEF as its byte-mode container for physical delivery codes. The project's own SPEC.md documents a QDEF Record Type for route payloads and a namespace-scoped odd type ID alongside a global even type ID allocation. See [TagDrop on GitHub](https://github.com/mofosyne/tagdrop).

## Prototype Implementations

### Node.js (full design)

A round-trip prototype covering the full QDEF design — container framing, Record routing, Wrapper Records (Split, Compress, Encrypt), App Route, and the Signature mechanism. Source at [`/prototype`](https://github.com/mofosyne/qdef/tree/main/prototype).

### Rust / `no_std` (mandatory core only)

A zero-dependency Rust prototype of the mandatory core parser, targeting `no_std` environments including bare-metal Cortex-M0. Covers container framing, Record routing, and even/odd criticality — no standard library records. Source at [`/rust/qdef-core`](https://github.com/mofosyne/qdef/tree/main/rust/qdef-core).

---

**Adding your project?** Open an issue or PR on [GitHub](https://github.com/qdef-format/qdef-format).
