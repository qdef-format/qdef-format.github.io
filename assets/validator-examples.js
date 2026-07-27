const VALIDATOR_EXAMPLES = [
  {
    label: 'Wi-Fi + URL Bundle',
    hex: '51 44 45 46 82 82 18 64 a3 00 6e 4d 79 20 43 6f 66 66 65 65 20 53 68 6f 70 02 68 67 75 65 73 74 31 32 33 04 02 82 0a a1 00 78 1f 68 74 74 70 73 3a 2f 2f 65 78 61 6d 70 6c 65 2e 63 6f 6d 2f 63 6f 66 66 65 65 2d 6d 65 6e 75'
  },
  {
    label: 'TagDrop Route (scoped)',
    hex: '51 44 45 46 81 83 44 89 d4 14 e0 01 a2 00 48 53 6f 6d 65 44 65 73 74 02 01'
  },
  {
    label: 'Media Preview + Payload',
    hex: '51 44 45 46 81 83 0e a3 00 6a 74 65 78 74 2f 70 6c 61 69 6e 2a 48 12 9d a0 88 d6 d3 61 bc 2e 69 68 65 6c 6c 6f 2e 74 78 74 83 06 a1 00 6a 74 65 78 74 2f 70 6c 61 69 6e 58 19 48 65 6c 6c 6f 20 66 72 6f 6d 20 54 61 67 44 72 6f 70 20 43 6f 6e 74 65 6e 74'
  },
  {
    label: 'TagDrop Content Extension',
    hex: '51 44 45 46 81 83 44 89 d4 14 e0 01 a3 03 64 68 69 6e 74 0b 6a 64 65 73 63 72 69 70 74 69 6f 6e 0d 42 01 02'
  },
  {
    label: 'Single URL (global typeId=10)',
    hex: '51 44 45 46 81 82 0a a1 00 78 18 68 74 74 70 73 3a 2f 2f 65 78 61 6d 70 6c 65 2e 63 6f 6d 2f 71 64 65 66'
  },
  {
    label: 'Empty Bundle (typeId=0, no subrecords)',
    hex: '51 44 45 46 80'
  },
  {
    label: 'Invalid: no magic header',
    hex: '00 01 02 03 81 01'
  }
];
