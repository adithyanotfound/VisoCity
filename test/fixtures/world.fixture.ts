import type { Building, District, WorldSnapshot } from '@visoagent/protocol';

export const mockDistrict: District = {
  id: 'dist-src',
  path: 'src',
  name: 'src',
  loc: 540,
  gridX: 0,
  gridY: 0,
  width: 20,
  height: 20,
  colorHex: '#3b82f6',
};

export const mockDistrictUtils: District = {
  id: 'dist-utils',
  path: 'src/utils',
  name: 'utils',
  loc: 180,
  gridX: 20,
  gridY: 0,
  width: 10,
  height: 20,
  colorHex: '#10b981',
};

export const mockBuilding: Building = {
  id: 'b-main',
  path: 'src/main.ts',
  filename: 'main.ts',
  districtId: 'dist-src',
  language: 'typescript',
  colorHex: '#3178c6',
  loc: 120,
  gridX: 2,
  gridY: 2,
  width: 2,
  height: 2,
  elevation: 4,
};

export const mockBuildingHelper: Building = {
  id: 'b-helper',
  path: 'src/utils/helper.ts',
  filename: 'helper.ts',
  districtId: 'dist-utils',
  language: 'typescript',
  colorHex: '#3178c6',
  loc: 80,
  gridX: 22,
  gridY: 4,
  width: 2,
  height: 2,
  elevation: 3,
};

export const mockRoad = {
  from: { x: 4, y: 4 },
  to: { x: 22, y: 6 },
};

export const mockWorldSnapshot: WorldSnapshot = {
  cityId: 'main',
  repoName: 'visoagent',
  commitSha: 'a1b2c3d4e5f67890123456789abcdef012345678',
  totalLoc: 720,
  bounds: {
    minX: 0,
    minY: 0,
    maxX: 30,
    maxY: 20,
  },
  districts: [mockDistrict, mockDistrictUtils],
  buildings: [mockBuilding, mockBuildingHelper],
  roads: [mockRoad],
};

export const mockEmptyWorldSnapshot: WorldSnapshot = {
  cityId: 'empty-city',
  repoName: 'empty-repo',
  commitSha: '0000000000000000000000000000000000000000',
  totalLoc: 0,
  bounds: {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  },
  districts: [],
  buildings: [],
  roads: [],
};
