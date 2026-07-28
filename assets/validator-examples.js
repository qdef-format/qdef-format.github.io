(typeof globalThis !== 'undefined' ? globalThis : window).VALIDATOR_EXAMPLES = [
  {
    label: 'Wi-Fi + URL Bundle',
    descriptor: 'A Bundle of two Records — an illustrative Wi-Fi credential (type [100]) and a standard Open/Hint URI (type [10]). Fields use the new key numbering (2=SSID, 4=password, 6=encryption).',
    expectValid: true,
    hex: '51 44 45 46 82 82 18 64 A3 02 6E 4D 79 20 43 6F 66 66 65 65 20 53 68 6F 70 04 68 67 75 65 73 74 31 32 33 06 02 82 0A A1 00 78 1F 68 74 74 70 73 3A 2F 2F 65 78 61 6D 70 6C 65 2E 63 6F 6D 2F 63 6F 66 66 65 65 2D 6D 65 6E 75'
  },
  {
    label: 'TagDrop Route (scoped)',
    descriptor: 'A scoped Record under namespace h\'89d414e0\' (TagDrop) with typeId [1], payload at key 0.',
    expectValid: true,
    hex: '51 44 45 46 81 83 44 89 D4 14 E0 01 A2 00 48 53 6F 6D 65 44 65 73 74 02 01'
  },
  {
    label: 'Media Preview + Payload',
    descriptor: 'A Media Preview (type [14]) with keys 2=media type, 3=content hash, 5=filename. Nested Media Payload (type [6]) with content at key 0 and media type at key 1.',
    expectValid: true,
    hex: '51 44 45 46 81 83 0E A3 02 6A 74 65 78 74 2F 70 6C 61 69 6E 03 48 12 9D A0 88 D6 D3 61 BC 05 69 68 65 6C 6C 6F 2E 74 78 74 82 06 A2 00 58 1A 48 65 6C 6C 6F 20 66 72 6F 6D 20 54 61 67 44 72 6F 70 20 43 6F 6E 74 65 6E 74 01 6A 74 65 78 74 2F 70 6C 61 69 6E'
  },
  {
    label: 'TagDrop Content Extension',
    descriptor: 'A scoped Record (typeId [1]) under namespace h\'89d414e0\' with three extension fields.',
    expectValid: true,
    hex: '51 44 45 46 81 83 44 89 D4 14 E0 01 A3 03 64 68 69 6E 74 0B 6B 64 65 73 63 72 69 70 74 69 6F 6E 0D 42 01 02'
  },
  {
    label: 'Single URL (type [10])',
    descriptor: 'A minimal Open/Hint URI Record (type [10]) with the URI as payload at key 0.',
    expectValid: true,
    hex: '51 44 45 46 82 0A A1 00 78 18 68 74 74 70 73 3A 2F 2F 65 78 61 6D 70 6C 65 2E 63 6F 6D 2F 71 64 65 66'
  },
  {
    label: 'Empty Bundle (no subrecords)',
    descriptor: 'The smallest valid QDEF payload — a Bundle containing zero Records.',
    expectValid: true,
    hex: '51 44 45 46 80'
  },
  {
    label: 'UUID-only Bundle (tag identity)',
    descriptor: 'A minimal payload with just a UUID — identifies the QR tag itself, no content subrecords. Useful for inventory tracking. (Whether the UUID identifies the tag or the container is an open design question — see DESIGN.md.)',
    expectValid: true,
    hex: '51 44 45 46 81 A1 22 50 00 11 22 33 44 55 66 77 88 99 AA BB CC DD EE FF'
  },
  {
    label: 'Invalid: no magic header',
    descriptor: 'A payload missing the QDEF magic header — the validator falls back to raw CBOR parsing and reports the mismatch.',
    expectValid: true,
    hex: '00 01 02 03 81 01'
  },
  {
    label: 'Namespace cascade (inherit marker)',
    descriptor: 'A Bundle with namespace and ns annotation, subrecord uses h\'\' to inherit the namespace.',
    expectValid: true,
    hex: '51 44 45 46 83 44 89 D4 14 E0 67 54 61 67 44 72 6F 70 84 40 01 65 52 6F 75 74 65 A2 00 44 64 65 73 74 02 01'
  }
];
