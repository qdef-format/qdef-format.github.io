(typeof globalThis !== 'undefined' ? globalThis : window).VALIDATOR_EXAMPLES = [
  {
    label: 'Wi-Fi + URL Bundle',
    descriptor: 'A Bundle of two Records — an illustrative Wi-Fi credential (type [100]) and a standard Open/Hint URI (type [5]). Fields use key 2=SSID, 4=password, 6=encryption.',
    expectValid: true,
    hex: '51 44 45 46 82 82 18 64 A3 02 6E 4D 79 20 43 6F 66 66 65 65 20 53 68 6F 70 04 68 67 75 65 73 74 31 32 33 06 02 82 05 A1 00 78 1F 68 74 74 70 73 3A 2F 2F 65 78 61 6D 70 6C 65 2E 63 6F 6D 2F 63 6F 66 66 65 65 2D 6D 65 6E 75'
  },
  {
    label: 'TagDrop Route (scoped)',
    descriptor: 'A Bundle carrying namespace h\'89d414e0\' (TagDrop) for its subrecord (§3.5 -- a namespace bstr always cascades; its negative-typeId subrecord adopts that ambient value since it carries no bstr of its own), whose negative typeId [-1] adopts it, payload at key 0.',
    expectValid: true,
    hex: '51 44 45 46 82 44 89 D4 14 E0 82 20 A2 00 48 53 6F 6D 65 44 65 73 74 02 01'
  },
  {
    label: 'TagDrop Route (self-scoped, no Bundle)',
    descriptor: 'Same Record as "TagDrop Route (scoped)" above, but with no Bundle wrapper: the namespace bstr and the negative typeId [-1] sit on the SAME array, so this one Record both declares h\'89d414e0\' and is scoped by it (§3.5) -- 1 byte shorter than the Bundle-wrapped form, since there\'s no separate array-header cost for a wrapper that would otherwise exist only to host the namespace.',
    expectValid: true,
    hex: '51 44 45 46 83 44 89 D4 14 E0 20 A2 00 48 53 6F 6D 65 44 65 73 74 02 01'
  },
  {
    label: 'Media Preview + Payload',
    descriptor: 'A Media Preview (type [7]) with keys 2=media type, 3=content hash, 5=filename. Nested Media Payload (type [3]) with content at key 0 and media type at key 1.',
    expectValid: true,
    hex: '51 44 45 46 81 83 07 A3 02 6A 74 65 78 74 2F 70 6C 61 69 6E 03 48 12 9D A0 88 D6 D3 61 BC 05 69 68 65 6C 6C 6F 2E 74 78 74 82 03 A2 00 58 1A 48 65 6C 6C 6F 20 66 72 6F 6D 20 54 61 67 44 72 6F 70 20 43 6F 6E 74 65 6E 74 01 6A 74 65 78 74 2F 70 6C 61 69 6E'
  },
  {
    label: 'TagDrop Content Extension',
    descriptor: 'A Bundle carrying namespace h\'89d414e0\' (TagDrop) for its subrecord (no bstr of its own), whose negative typeId [-1] adopts it, with three extension fields.',
    expectValid: true,
    hex: '51 44 45 46 82 44 89 D4 14 E0 82 20 A3 03 64 68 69 6E 74 0B 6B 64 65 73 63 72 69 70 74 69 6F 6E 0D 42 01 02'
  },
  {
    label: 'Single URL (type [5] — Open/Hint URI)',
    descriptor: 'A minimal Open/Hint URI Record (type [5]) with the URI as payload at key 0.',
    expectValid: true,
    hex: '51 44 45 46 82 05 A1 00 78 18 68 74 74 70 73 3A 2F 2F 65 78 61 6D 70 6C 65 2E 63 6F 6D 2F 71 64 65 66'
  },
  {
    label: 'Empty Bundle (no subrecords)',
    descriptor: 'The smallest valid QDEF payload — a Bundle containing zero Records.',
    expectValid: true,
    hex: '51 44 45 46 80'
  },
  {
    label: 'Record with UUID-tagged ID',
    descriptor: 'A Record with key -1 carrying a CBOR tag 37 (UUID). The validator recognizes the tag and displays the UUID in standard format.',
    expectValid: true,
    hex: '51 44 45 46 81 82 18 64 A1 20 D8 25 50 00 11 22 33 44 55 66 77 88 99 AA BB CC DD EE FF'
  },
  {
    label: 'Invalid: no magic header',
    descriptor: 'A payload missing the QDEF magic header — the validator falls back to raw CBOR parsing and reports the mismatch. The hex here is a synthetic byte sequence for this demo, not a well-formed single Record, so parsing from byte 0 (correctly, since there\'s no magic to strip) only consumes the leading uint and reports the rest as unparsed.',
    expectValid: true,
    expectClean: false,
    hex: '00 01 02 03 81 01'
  },
  {
    label: 'Namespace cascade (negative typeId inherits)',
    descriptor: 'A Bundle with namespace and ns annotation, subrecord uses a negative typeId (-1) to inherit the namespace (§3.5).',
    expectValid: true,
    hex: '51 44 45 46 83 44 89 D4 14 E0 67 54 61 67 44 72 6F 70 83 20 65 52 6F 75 74 65 A2 00 44 64 65 73 74 02 01'
  },
  {
    label: 'Namespace present but typeId stays global (inert)',
    descriptor: 'A namespace bstr always cascades to subrecords (§3.5), but only ALSO scopes its own Record when that Record\'s typeId is negative. This typeId [5] is non-negative (Open/Hint URI), so it reads as global regardless of the TagDrop namespace sitting right next to it; the namespace has no subrecords here to cascade to either, so it\'s entirely inert in this example.',
    expectValid: true,
    hex: '51 44 45 46 83 44 89 D4 14 E0 05 A1 00 78 18 68 74 74 70 73 3A 2F 2F 65 78 61 6D 70 6C 65 2E 63 6F 6D 2F 71 64 65 66'
  }
];
