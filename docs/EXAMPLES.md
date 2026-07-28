# QDEF Record Type Examples

Informative examples — actual QDEF payloads decoded into human-readable
Record Type definitions.

## Wi-Fi + URL Bundle

A Bundle of two Records — an illustrative Wi-Fi credential (type `[100]`)
and a standard Open/Hint URI (type `[10]`). Standard types are global
(no namespace) with reserved low numbers.

```js
[                          // Bundle
  [100, {                 // typeId [100], no namespace
    2: "My Coffee Shop",
    4: "guest123"
  }],
  [10, {                  // standard type [10] — Open/Hint URI
    0: "https://example.com/coffee-menu"
  }]
]
```

## Namespaced app type with annotations

A scoped Record with self-certifying namespace and annotations on both
namespace and type:

```js
[                          // Bundle
  [h'89d414e0',           // namespace
   "TagDrop",              // ns annotation
   1, "Route",            // typeId [1], type annotation
   {0: h'<payload bytes>'}]
]
```

## App type with type annotation only

```js
[100, "WiFi Credential", {  // typeId [100], type annotation
  2: "My Coffee Shop",
  4: "guest123"
}]
```

## Standard type (no namespace)

```js
[10, {0: "https://example.com/qdef"}]  // Open/Hint URI
```

## Inherited namespace

```js
[h'89d414e0', "TagDrop",   // namespace + annotation
  [1, "Route",             // subrecord inherits
   {0: h'<payload>'}]]
```

## Empty Bundle

The smallest valid QDEF:

```js
[]
```
