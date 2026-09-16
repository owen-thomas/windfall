/* Generated from live endpoints — see scenarios.ts. */
import type { GridResponse, CurtailmentResponse } from './types.js';

export const SAMPLE_GRID: GridResponse = {
  "fetchedAt": "2026-07-24T19:48:53.731Z",
  "settlement": {
    "date": "2026-07-24",
    "period": 42,
    "periodStart": "2026-07-24T19:30:00.000Z",
    "periodEnd": "2026-07-24T20:00:00.000Z"
  },
  "health": {
    "overall": "ok",
    "national": "ok",
    "regional": "ok",
    "forecast": "ok"
  },
  "errors": [],
  "national": {
    "intensity": {
      "forecast": 139,
      "actual": 149,
      "index": "moderate"
    },
    "generationMix": [
      {
        "fuel": "biomass",
        "perc": 9.3
      },
      {
        "fuel": "coal",
        "perc": 0
      },
      {
        "fuel": "imports",
        "perc": 13.4
      },
      {
        "fuel": "gas",
        "perc": 31.2
      },
      {
        "fuel": "nuclear",
        "perc": 12.4
      },
      {
        "fuel": "other",
        "perc": 0
      },
      {
        "fuel": "hydro",
        "perc": 0
      },
      {
        "fuel": "solar",
        "perc": 4.6
      },
      {
        "fuel": "wind",
        "perc": 29.1
      }
    ],
    "windPct": 29.1,
    "gasPct": 31.2
  },
  "regions": {
    "scotland": {
      "regionId": 16,
      "name": "Scotland",
      "intensity": {
        "forecast": 1,
        "actual": null,
        "index": "very low"
      },
      "generationMix": [
        {
          "fuel": "biomass",
          "perc": 0.9
        },
        {
          "fuel": "coal",
          "perc": 0
        },
        {
          "fuel": "imports",
          "perc": 0
        },
        {
          "fuel": "gas",
          "perc": 0
        },
        {
          "fuel": "nuclear",
          "perc": 22.8
        },
        {
          "fuel": "other",
          "perc": 0
        },
        {
          "fuel": "hydro",
          "perc": 0
        },
        {
          "fuel": "solar",
          "perc": 0.6
        },
        {
          "fuel": "wind",
          "perc": 75.7
        }
      ],
      "windPct": 75.7,
      "gasPct": 0
    },
    "northScotland": {
      "regionId": 1,
      "name": "North Scotland",
      "intensity": {
        "forecast": 0,
        "actual": null,
        "index": "very low"
      },
      "generationMix": [
        {
          "fuel": "biomass",
          "perc": 0
        },
        {
          "fuel": "coal",
          "perc": 0
        },
        {
          "fuel": "imports",
          "perc": 0
        },
        {
          "fuel": "gas",
          "perc": 0
        },
        {
          "fuel": "nuclear",
          "perc": 0
        },
        {
          "fuel": "other",
          "perc": 0
        },
        {
          "fuel": "hydro",
          "perc": 0
        },
        {
          "fuel": "solar",
          "perc": 0.7
        },
        {
          "fuel": "wind",
          "perc": 99.3
        }
      ],
      "windPct": 99.3,
      "gasPct": 0
    },
    "southScotland": {
      "regionId": 2,
      "name": "South Scotland",
      "intensity": {
        "forecast": 1,
        "actual": null,
        "index": "very low"
      },
      "generationMix": [
        {
          "fuel": "biomass",
          "perc": 1
        },
        {
          "fuel": "coal",
          "perc": 0
        },
        {
          "fuel": "imports",
          "perc": 0
        },
        {
          "fuel": "gas",
          "perc": 0
        },
        {
          "fuel": "nuclear",
          "perc": 24.7
        },
        {
          "fuel": "other",
          "perc": 0
        },
        {
          "fuel": "hydro",
          "perc": 0
        },
        {
          "fuel": "solar",
          "perc": 0.7
        },
        {
          "fuel": "wind",
          "perc": 73.6
        }
      ],
      "windPct": 73.6,
      "gasPct": 0
    },
    "southEngland": {
      "regionId": 12,
      "name": "South England",
      "intensity": {
        "forecast": 206,
        "actual": null,
        "index": "high"
      },
      "generationMix": [
        {
          "fuel": "biomass",
          "perc": 7.6
        },
        {
          "fuel": "coal",
          "perc": 0
        },
        {
          "fuel": "imports",
          "perc": 9.8
        },
        {
          "fuel": "gas",
          "perc": 49.1
        },
        {
          "fuel": "nuclear",
          "perc": 8.8
        },
        {
          "fuel": "other",
          "perc": 0
        },
        {
          "fuel": "hydro",
          "perc": 0
        },
        {
          "fuel": "solar",
          "perc": 7.6
        },
        {
          "fuel": "wind",
          "perc": 17.2
        }
      ],
      "windPct": 17.2,
      "gasPct": 49.1
    },
    "southEastEngland": {
      "regionId": 14,
      "name": "South East England",
      "intensity": {
        "forecast": 118,
        "actual": null,
        "index": "moderate"
      },
      "generationMix": [
        {
          "fuel": "biomass",
          "perc": 0
        },
        {
          "fuel": "coal",
          "perc": 0
        },
        {
          "fuel": "imports",
          "perc": 70.5
        },
        {
          "fuel": "gas",
          "perc": 20.6
        },
        {
          "fuel": "nuclear",
          "perc": 0
        },
        {
          "fuel": "other",
          "perc": 0
        },
        {
          "fuel": "hydro",
          "perc": 0.5
        },
        {
          "fuel": "solar",
          "perc": 1.5
        },
        {
          "fuel": "wind",
          "perc": 6.9
        }
      ],
      "windPct": 6.9,
      "gasPct": 20.6
    },
    "england": {
      "regionId": 15,
      "name": "England",
      "intensity": {
        "forecast": 151,
        "actual": null,
        "index": "high"
      },
      "generationMix": [
        {
          "fuel": "biomass",
          "perc": 9
        },
        {
          "fuel": "coal",
          "perc": 0
        },
        {
          "fuel": "imports",
          "perc": 12
        },
        {
          "fuel": "gas",
          "perc": 35
        },
        {
          "fuel": "nuclear",
          "perc": 18
        },
        {
          "fuel": "other",
          "perc": 6
        },
        {
          "fuel": "hydro",
          "perc": 0
        },
        {
          "fuel": "solar",
          "perc": 8
        },
        {
          "fuel": "wind",
          "perc": 12
        }
      ],
      "windPct": 12,
      "gasPct": 35
    }
  },
  "forecast": [
    {
      "from": "2026-07-24T19:30Z",
      "to": "2026-07-24T20:00Z",
      "forecast": 143,
      "index": "moderate"
    },
    {
      "from": "2026-07-24T20:00Z",
      "to": "2026-07-24T20:30Z",
      "forecast": 142,
      "index": "moderate"
    },
    {
      "from": "2026-07-24T20:30Z",
      "to": "2026-07-24T21:00Z",
      "forecast": 142,
      "index": "moderate"
    },
    {
      "from": "2026-07-24T21:00Z",
      "to": "2026-07-24T21:30Z",
      "forecast": 134,
      "index": "moderate"
    },
    {
      "from": "2026-07-24T21:30Z",
      "to": "2026-07-24T22:00Z",
      "forecast": 127,
      "index": "moderate"
    },
    {
      "from": "2026-07-24T22:00Z",
      "to": "2026-07-24T22:30Z",
      "forecast": 118,
      "index": "moderate"
    },
    {
      "from": "2026-07-24T22:30Z",
      "to": "2026-07-24T23:00Z",
      "forecast": 110,
      "index": "moderate"
    },
    {
      "from": "2026-07-24T23:00Z",
      "to": "2026-07-24T23:30Z",
      "forecast": 104,
      "index": "moderate"
    },
    {
      "from": "2026-07-24T23:30Z",
      "to": "2026-07-25T00:00Z",
      "forecast": 102,
      "index": "moderate"
    },
    {
      "from": "2026-07-25T00:00Z",
      "to": "2026-07-25T00:30Z",
      "forecast": 90,
      "index": "moderate"
    },
    {
      "from": "2026-07-25T00:30Z",
      "to": "2026-07-25T01:00Z",
      "forecast": 82,
      "index": "low"
    },
    {
      "from": "2026-07-25T01:00Z",
      "to": "2026-07-25T01:30Z",
      "forecast": 78,
      "index": "low"
    },
    {
      "from": "2026-07-25T01:30Z",
      "to": "2026-07-25T02:00Z",
      "forecast": 85,
      "index": "low"
    },
    {
      "from": "2026-07-25T02:00Z",
      "to": "2026-07-25T02:30Z",
      "forecast": 82,
      "index": "low"
    },
    {
      "from": "2026-07-25T02:30Z",
      "to": "2026-07-25T03:00Z",
      "forecast": 83,
      "index": "low"
    },
    {
      "from": "2026-07-25T03:00Z",
      "to": "2026-07-25T03:30Z",
      "forecast": 81,
      "index": "low"
    },
    {
      "from": "2026-07-25T03:30Z",
      "to": "2026-07-25T04:00Z",
      "forecast": 78,
      "index": "low"
    },
    {
      "from": "2026-07-25T04:00Z",
      "to": "2026-07-25T04:30Z",
      "forecast": 82,
      "index": "low"
    },
    {
      "from": "2026-07-25T04:30Z",
      "to": "2026-07-25T05:00Z",
      "forecast": 82,
      "index": "low"
    },
    {
      "from": "2026-07-25T05:00Z",
      "to": "2026-07-25T05:30Z",
      "forecast": 84,
      "index": "low"
    },
    {
      "from": "2026-07-25T05:30Z",
      "to": "2026-07-25T06:00Z",
      "forecast": 77,
      "index": "low"
    },
    {
      "from": "2026-07-25T06:00Z",
      "to": "2026-07-25T06:30Z",
      "forecast": 72,
      "index": "low"
    },
    {
      "from": "2026-07-25T06:30Z",
      "to": "2026-07-25T07:00Z",
      "forecast": 71,
      "index": "low"
    },
    {
      "from": "2026-07-25T07:00Z",
      "to": "2026-07-25T07:30Z",
      "forecast": 63,
      "index": "low"
    },
    {
      "from": "2026-07-25T07:30Z",
      "to": "2026-07-25T08:00Z",
      "forecast": 55,
      "index": "low"
    },
    {
      "from": "2026-07-25T08:00Z",
      "to": "2026-07-25T08:30Z",
      "forecast": 51,
      "index": "low"
    },
    {
      "from": "2026-07-25T08:30Z",
      "to": "2026-07-25T09:00Z",
      "forecast": 45,
      "index": "low"
    },
    {
      "from": "2026-07-25T09:00Z",
      "to": "2026-07-25T09:30Z",
      "forecast": 42,
      "index": "low"
    },
    {
      "from": "2026-07-25T09:30Z",
      "to": "2026-07-25T10:00Z",
      "forecast": 40,
      "index": "low"
    },
    {
      "from": "2026-07-25T10:00Z",
      "to": "2026-07-25T10:30Z",
      "forecast": 40,
      "index": "low"
    },
    {
      "from": "2026-07-25T10:30Z",
      "to": "2026-07-25T11:00Z",
      "forecast": 38,
      "index": "low"
    },
    {
      "from": "2026-07-25T11:00Z",
      "to": "2026-07-25T11:30Z",
      "forecast": 32,
      "index": "low"
    },
    {
      "from": "2026-07-25T11:30Z",
      "to": "2026-07-25T12:00Z",
      "forecast": 32,
      "index": "low"
    },
    {
      "from": "2026-07-25T12:00Z",
      "to": "2026-07-25T12:30Z",
      "forecast": 31,
      "index": "low"
    },
    {
      "from": "2026-07-25T12:30Z",
      "to": "2026-07-25T13:00Z",
      "forecast": 31,
      "index": "low"
    },
    {
      "from": "2026-07-25T13:00Z",
      "to": "2026-07-25T13:30Z",
      "forecast": 32,
      "index": "low"
    },
    {
      "from": "2026-07-25T13:30Z",
      "to": "2026-07-25T14:00Z",
      "forecast": 30,
      "index": "low"
    },
    {
      "from": "2026-07-25T14:00Z",
      "to": "2026-07-25T14:30Z",
      "forecast": 29,
      "index": "low"
    },
    {
      "from": "2026-07-25T14:30Z",
      "to": "2026-07-25T15:00Z",
      "forecast": 31,
      "index": "low"
    },
    {
      "from": "2026-07-25T15:00Z",
      "to": "2026-07-25T15:30Z",
      "forecast": 29,
      "index": "low"
    },
    {
      "from": "2026-07-25T15:30Z",
      "to": "2026-07-25T16:00Z",
      "forecast": 32,
      "index": "low"
    },
    {
      "from": "2026-07-25T16:00Z",
      "to": "2026-07-25T16:30Z",
      "forecast": 37,
      "index": "low"
    },
    {
      "from": "2026-07-25T16:30Z",
      "to": "2026-07-25T17:00Z",
      "forecast": 47,
      "index": "low"
    },
    {
      "from": "2026-07-25T17:00Z",
      "to": "2026-07-25T17:30Z",
      "forecast": 54,
      "index": "low"
    },
    {
      "from": "2026-07-25T17:30Z",
      "to": "2026-07-25T18:00Z",
      "forecast": 62,
      "index": "low"
    },
    {
      "from": "2026-07-25T18:00Z",
      "to": "2026-07-25T18:30Z",
      "forecast": 72,
      "index": "low"
    },
    {
      "from": "2026-07-25T18:30Z",
      "to": "2026-07-25T19:00Z",
      "forecast": 82,
      "index": "low"
    },
    {
      "from": "2026-07-25T19:00Z",
      "to": "2026-07-25T19:30Z",
      "forecast": 88,
      "index": "low"
    }
  ]
};

export const SAMPLE_CURTAILMENT: CurtailmentResponse = {
  "fetchedAt": "2026-07-24T19:48:52.905Z",
  "health": {
    "overall": "ok",
    "now": "ok",
    "settled": "ok"
  },
  "errors": [],
  "now": {
    "settlement": {
      "date": "2026-07-24",
      "period": 42,
      "periodStart": "2026-07-24T19:30:00.000Z",
      "periodEnd": "2026-07-24T20:00:00.000Z"
    },
    "sampledAt": "2026-07-24T19:48:52.654Z",
    "curtailedMW": 2049.5,
    "unitsCurtailed": 19,
    "units": [
      {
        "id": "SGRWO-6",
        "name": "Seagreen 6",
        "farm": "Seagreen",
        "capacityMW": 525.302,
        "curtailedMW": 316
      },
      {
        "id": "MOWEO-1",
        "name": "Moray East 1",
        "farm": "Moray East",
        "capacityMW": 300,
        "curtailedMW": 213
      },
      {
        "id": "MOWWO-4",
        "name": "Moray West 4",
        "farm": "Moray West",
        "capacityMW": 287,
        "curtailedMW": 203
      },
      {
        "id": "MOWEO-2",
        "name": "Moray East 2",
        "farm": "Moray East",
        "capacityMW": 300,
        "curtailedMW": 165
      },
      {
        "id": "MOWWO-1",
        "name": "Moray West 1",
        "farm": "Moray West",
        "capacityMW": 215,
        "curtailedMW": 160
      },
      {
        "id": "SGRWO-3",
        "name": "Seagreen 3",
        "farm": "Seagreen",
        "capacityMW": 374.618,
        "curtailedMW": 134
      },
      {
        "id": "SGRWO-4",
        "name": "Seagreen 4",
        "farm": "Seagreen",
        "capacityMW": 140,
        "curtailedMW": 113
      },
      {
        "id": "MOWWO-2",
        "name": "Moray West 2",
        "farm": "Moray West",
        "capacityMW": 215,
        "curtailedMW": 111
      },
      {
        "id": "BEATO-4",
        "name": "Beatrice 4",
        "farm": "Beatrice",
        "capacityMW": 165.526,
        "curtailedMW": 105
      },
      {
        "id": "MOWWO-3",
        "name": "Moray West 3",
        "farm": "Moray West",
        "capacityMW": 143,
        "curtailedMW": 103
      },
      {
        "id": "CREAW-1",
        "name": "Creag Riabhach",
        "farm": "Creag Riabhach",
        "capacityMW": 93,
        "curtailedMW": 76.5
      },
      {
        "id": "SGRWO-5",
        "name": "Seagreen 5",
        "farm": "Seagreen",
        "capacityMW": 300,
        "curtailedMW": 68
      },
      {
        "id": "BEATO-2",
        "name": "Beatrice 2",
        "farm": "Beatrice",
        "capacityMW": 166,
        "curtailedMW": 63
      },
      {
        "id": "LIMKW-1",
        "name": "Limekiln",
        "farm": "Limekiln",
        "capacityMW": 106,
        "curtailedMW": 61
      },
      {
        "id": "BEATO-1",
        "name": "Beatrice 1",
        "farm": "Beatrice",
        "capacityMW": 184,
        "curtailedMW": 55
      },
      {
        "id": "GLNKW-1",
        "name": "Glen Kyllachy",
        "farm": "Glen Kyllachy",
        "capacityMW": 52,
        "curtailedMW": 48
      },
      {
        "id": "HALSW-1",
        "name": "Halsary",
        "farm": "Halsary",
        "capacityMW": 30,
        "curtailedMW": 23
      },
      {
        "id": "GORDW-2",
        "name": "Gordonbush Ext",
        "farm": "Gordonbush",
        "capacityMW": 58.733,
        "curtailedMW": 17
      },
      {
        "id": "EDINW-1",
        "name": "Edinbane (Skye)",
        "farm": "Edinbane",
        "capacityMW": 41.4,
        "curtailedMW": 15
      }
    ],
    "farms": [
      {
        "farm": "Seagreen",
        "capacityMW": 1991.1,
        "declaredMW": 631,
        "instructedMW": 0,
        "curtailedMW": 631,
        "unitsDeclaring": 6,
        "unitsCurtailed": 4
      },
      {
        "farm": "Moray West",
        "capacityMW": 860,
        "declaredMW": 661,
        "instructedMW": 84,
        "curtailedMW": 577,
        "unitsDeclaring": 4,
        "unitsCurtailed": 4
      },
      {
        "farm": "Moray East",
        "capacityMW": 900,
        "declaredMW": 444,
        "instructedMW": 66,
        "curtailedMW": 378,
        "unitsDeclaring": 3,
        "unitsCurtailed": 2
      },
      {
        "farm": "Beatrice",
        "capacityMW": 681.5,
        "declaredMW": 391,
        "instructedMW": 168,
        "curtailedMW": 223,
        "unitsDeclaring": 4,
        "unitsCurtailed": 3
      },
      {
        "farm": "Creag Riabhach",
        "capacityMW": 93,
        "declaredMW": 82.5,
        "instructedMW": 6,
        "curtailedMW": 76.5,
        "unitsDeclaring": 1,
        "unitsCurtailed": 1
      },
      {
        "farm": "Limekiln",
        "capacityMW": 106,
        "declaredMW": 61,
        "instructedMW": 0,
        "curtailedMW": 61,
        "unitsDeclaring": 1,
        "unitsCurtailed": 1
      },
      {
        "farm": "Glen Kyllachy",
        "capacityMW": 52,
        "declaredMW": 48,
        "instructedMW": 0,
        "curtailedMW": 48,
        "unitsDeclaring": 1,
        "unitsCurtailed": 1
      },
      {
        "farm": "Halsary",
        "capacityMW": 30,
        "declaredMW": 23,
        "instructedMW": 0,
        "curtailedMW": 23,
        "unitsDeclaring": 1,
        "unitsCurtailed": 1
      },
      {
        "farm": "Gordonbush",
        "capacityMW": 145.5,
        "declaredMW": 60,
        "instructedMW": 43,
        "curtailedMW": 17,
        "unitsDeclaring": 2,
        "unitsCurtailed": 1
      },
      {
        "farm": "Edinbane",
        "capacityMW": 41.4,
        "declaredMW": 25,
        "instructedMW": 10,
        "curtailedMW": 15,
        "unitsDeclaring": 1,
        "unitsCurtailed": 1
      },
      {
        "farm": "Aberdeen Offshore",
        "capacityMW": 99,
        "declaredMW": 16,
        "instructedMW": 16,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Neart Na Gaoithe",
        "capacityMW": 448,
        "declaredMW": 448,
        "instructedMW": 448,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Robin Rigg",
        "capacityMW": 205.1,
        "declaredMW": 30,
        "instructedMW": 30,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Bad a Cheo",
        "capacityMW": 270,
        "declaredMW": 18,
        "instructedMW": 18,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Beinneun",
        "capacityMW": 108.8,
        "declaredMW": 60,
        "instructedMW": 60,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Bhlaraidh",
        "capacityMW": 108,
        "declaredMW": 81,
        "instructedMW": 81,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Corriegarth",
        "capacityMW": 69,
        "declaredMW": 49,
        "instructedMW": 49,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Corriemoillie",
        "capacityMW": 48,
        "declaredMW": 41.7,
        "instructedMW": 41.7,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Dorenell",
        "capacityMW": 313.8,
        "declaredMW": 152,
        "instructedMW": 152,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Dunmaglass",
        "capacityMW": 100,
        "declaredMW": 82,
        "instructedMW": 82,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Farr",
        "capacityMW": 184,
        "declaredMW": 56.6,
        "instructedMW": 56.6,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Kilbraur",
        "capacityMW": 68.5,
        "declaredMW": 17.9,
        "instructedMW": 17.9,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Lochluichart",
        "capacityMW": 69,
        "declaredMW": 52.6,
        "instructedMW": 52.6,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Millennium",
        "capacityMW": 65,
        "declaredMW": 33.5,
        "instructedMW": 33.5,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Stronelairg",
        "capacityMW": 324,
        "declaredMW": 170,
        "instructedMW": 170,
        "curtailedMW": 0,
        "unitsDeclaring": 3,
        "unitsCurtailed": 0
      },
      {
        "farm": "Strathy North",
        "capacityMW": 70,
        "declaredMW": 44,
        "instructedMW": 44,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Viking",
        "capacityMW": 487.2,
        "declaredMW": 0,
        "instructedMW": 0,
        "curtailedMW": 0,
        "unitsDeclaring": 4,
        "unitsCurtailed": 0
      },
      {
        "farm": "A’Chruach",
        "capacityMW": 42.6,
        "declaredMW": 14.4,
        "instructedMW": 14.4,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "An Suidhe",
        "capacityMW": 19.4,
        "declaredMW": 7.6,
        "instructedMW": 7.6,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Carraig Gheal",
        "capacityMW": 46,
        "declaredMW": 0,
        "instructedMW": 0,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Cour",
        "capacityMW": 20.5,
        "declaredMW": 9,
        "instructedMW": 9,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Freasdail",
        "capacityMW": 22.2,
        "declaredMW": 7,
        "instructedMW": 7,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Griffin",
        "capacityMW": 206,
        "declaredMW": 52,
        "instructedMW": 52,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Black Law",
        "capacityMW": 187,
        "declaredMW": 53,
        "instructedMW": 53,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Broken Cross",
        "capacityMW": 48,
        "declaredMW": 17.4,
        "instructedMW": 17.4,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Clyde",
        "capacityMW": 550,
        "declaredMW": 260,
        "instructedMW": 260,
        "curtailedMW": 0,
        "unitsDeclaring": 3,
        "unitsCurtailed": 0
      },
      {
        "farm": "Cumberhead",
        "capacityMW": 178,
        "declaredMW": 80,
        "instructedMW": 80,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Dalquhandy",
        "capacityMW": 42.8,
        "declaredMW": 7,
        "instructedMW": 7,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Douglas West",
        "capacityMW": 110.5,
        "declaredMW": 45.4,
        "instructedMW": 45.4,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Galawhistle",
        "capacityMW": 55.2,
        "declaredMW": 8,
        "instructedMW": 8,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Hagshaw Hill",
        "capacityMW": 30.3,
        "declaredMW": 15,
        "instructedMW": 15,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Kennoxhead",
        "capacityMW": 60,
        "declaredMW": 31,
        "instructedMW": 31,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Kype Muir",
        "capacityMW": 156,
        "declaredMW": 63,
        "instructedMW": 63,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Middle Muir",
        "capacityMW": 51,
        "declaredMW": 10,
        "instructedMW": 10,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Whitelee",
        "capacityMW": 515,
        "declaredMW": 115,
        "instructedMW": 115,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Aikengall",
        "capacityMW": 227.2,
        "declaredMW": 123,
        "instructedMW": 123,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Crystal Rig",
        "capacityMW": 212.6,
        "declaredMW": 167,
        "instructedMW": 167,
        "curtailedMW": 0,
        "unitsDeclaring": 3,
        "unitsCurtailed": 0
      },
      {
        "farm": "Dun Law",
        "capacityMW": 29.8,
        "declaredMW": 14,
        "instructedMW": 14,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Fallago Rig",
        "capacityMW": 144,
        "declaredMW": 89.6,
        "instructedMW": 89.6,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Pogbie",
        "capacityMW": 10,
        "declaredMW": 5,
        "instructedMW": 5,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Toddleburn",
        "capacityMW": 31.6,
        "declaredMW": 23,
        "instructedMW": 23,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Afton",
        "capacityMW": 50,
        "declaredMW": 22,
        "instructedMW": 22,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Arecleoch",
        "capacityMW": 114,
        "declaredMW": 8,
        "instructedMW": 8,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Benbrack",
        "capacityMW": 67,
        "declaredMW": 26.4,
        "instructedMW": 26.4,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Blackcraig",
        "capacityMW": 56.2,
        "declaredMW": 17.3,
        "instructedMW": 17.3,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Crossdykes",
        "capacityMW": 48,
        "declaredMW": 26,
        "instructedMW": 26,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Dersalloch",
        "capacityMW": 70.9,
        "declaredMW": 0,
        "instructedMW": 0,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Enoch Hill",
        "capacityMW": 70,
        "declaredMW": 0,
        "instructedMW": 0,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Ewe Hill",
        "capacityMW": 38,
        "declaredMW": 14,
        "instructedMW": 14,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Glen App",
        "capacityMW": 22,
        "declaredMW": 1,
        "instructedMW": 1,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Hadyard Hill",
        "capacityMW": 130,
        "declaredMW": 0,
        "instructedMW": 0,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Harestanes",
        "capacityMW": 142.3,
        "declaredMW": 48,
        "instructedMW": 48,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Kilgallioch",
        "capacityMW": 252.7,
        "declaredMW": 54,
        "instructedMW": 54,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Keith Hill",
        "capacityMW": 4.5,
        "declaredMW": 2,
        "instructedMW": 2,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Mark Hill",
        "capacityMW": 53.8,
        "declaredMW": 5,
        "instructedMW": 5,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Minnygap",
        "capacityMW": 25,
        "declaredMW": 7,
        "instructedMW": 7,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "North Kyle",
        "capacityMW": 212,
        "declaredMW": 0,
        "instructedMW": 0,
        "curtailedMW": 0,
        "unitsDeclaring": 2,
        "unitsCurtailed": 0
      },
      {
        "farm": "Pencloe",
        "capacityMW": 81,
        "declaredMW": 0,
        "instructedMW": 0,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Sandy Knowe",
        "capacityMW": 87,
        "declaredMW": 17.6,
        "instructedMW": 17.6,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Sanquhar",
        "capacityMW": 32.1,
        "declaredMW": 20.3,
        "instructedMW": 20.3,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "South Kyle",
        "capacityMW": 426.9,
        "declaredMW": 0,
        "instructedMW": 0,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Tralorg",
        "capacityMW": 18.7,
        "declaredMW": 6,
        "instructedMW": 6,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Twentyshilling",
        "capacityMW": 37.8,
        "declaredMW": 18.6,
        "instructedMW": 18.6,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Windy Rig",
        "capacityMW": 42.8,
        "declaredMW": 34.3,
        "instructedMW": 34.3,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Whiteside Hill",
        "capacityMW": 27.5,
        "declaredMW": 14.3,
        "instructedMW": 14.3,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      },
      {
        "farm": "Windy Standard",
        "capacityMW": 61.5,
        "declaredMW": 26.3,
        "instructedMW": 26.3,
        "curtailedMW": 0,
        "unitsDeclaring": 1,
        "unitsCurtailed": 0
      }
    ]
  },
  "settled": {
    "settlement": {
      "date": "2026-07-24",
      "period": 41,
      "periodStart": "2026-07-24T19:00:00.000Z",
      "periodEnd": "2026-07-24T19:30:00.000Z"
    },
    "curtailedMWh": 970.1,
    "unitsCurtailed": 16,
    "farms": [
      {
        "farm": "Seagreen",
        "name": "Seagreen",
        "curtailedMWh": 316
      },
      {
        "farm": "Moray West",
        "name": "Moray West",
        "curtailedMWh": 280
      },
      {
        "farm": "Moray East",
        "name": "Moray East",
        "curtailedMWh": 203
      },
      {
        "farm": "Beatrice",
        "name": "Beatrice",
        "curtailedMWh": 155.8
      },
      {
        "farm": "Gordonbush",
        "name": "Gordonbush",
        "curtailedMWh": 9
      },
      {
        "farm": "Edinbane",
        "name": "Edinbane",
        "curtailedMWh": 6.3
      }
    ]
  },
  "method": {
    "basis": "Instructed turn-downs of transmission-connected Scottish wind via the balancing mechanism: declared output (PN) minus accepted level (BOALF). Excludes self-curtailment, pre-adjusted declarations and distribution-connected units, so the figure is a floor.",
    "unitsTracked": 112,
    "capacityMW": 13105.454
  }
};
