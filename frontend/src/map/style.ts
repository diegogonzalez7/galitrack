import type { StyleSpecification } from 'maplibre-gl'

export const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    region: {
      type: 'geojson',
      data: '/data/galicia.geojson',
      attribution: '<a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">Natural Earth</a>',
    },
    routes: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'water', type: 'background', paint: { 'background-color': '#cce3e9' } },
    {
      id: 'land', type: 'fill', source: 'region', filter: ['==', ['get', 'kind'], 'land'],
      paint: { 'fill-color': '#eef0e3', 'fill-outline-color': '#b8ceca' },
    },
    {
      id: 'urban', type: 'fill', source: 'region', filter: ['==', ['get', 'kind'], 'urban'],
      paint: { 'fill-color': '#e3dfd1', 'fill-opacity': 0.8 },
    },
    {
      id: 'boundaries', type: 'line', source: 'region',
      filter: ['in', ['get', 'kind'], ['literal', ['border', 'province']]],
      paint: { 'line-color': '#b9c6ae', 'line-width': 1, 'line-dasharray': [4, 3] },
    },
    {
      id: 'river', type: 'line', source: 'region', filter: ['==', ['get', 'kind'], 'river'],
      paint: { 'line-color': '#a9cdd8', 'line-width': 1.4 },
    },
    {
      id: 'roads-case', type: 'line', source: 'region', filter: ['==', ['get', 'kind'], 'road'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#d9d3b9', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1, 12, 4] },
    },
    {
      id: 'roads', type: 'line', source: 'region', filter: ['==', ['get', 'kind'], 'road'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['case', ['==', ['get', 'major'], true], '#fff7dd', '#faf9ee'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 12, 2.6],
      },
    },
    {
      id: 'town-dots', type: 'circle', source: 'region',
      filter: ['all', ['==', ['get', 'kind'], 'town'], ['<=', ['get', 'rank'], 2]],
      paint: { 'circle-color': '#778473', 'circle-radius': ['match', ['get', 'rank'], 1, 2.7, 1.7] },
    },
    {
      id: 'towns', type: 'symbol', source: 'region',
      filter: ['all', ['==', ['get', 'kind'], 'town'], ['<=', ['get', 'rank'], 2]],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Arial Regular'],
        'text-size': ['match', ['get', 'rank'], 1, 13, 11],
        'text-offset': [
          'match', ['get', 'name'], 'Santiago de Compostela', ['literal', [0, 1.7]], ['literal', [0, 0.55]],
        ],
        'text-anchor': 'top',
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': '#49584d', 'text-halo-color': '#f5f6ed', 'text-halo-width': 1.5 },
    },
    {
      id: 'route-casing', type: 'line', source: 'routes',
      layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['get', 'priority'] },
      paint: { 'line-color': '#fff', 'line-width': ['case', ['==', ['get', 'priority'], 1], 8, 6] },
    },
    {
      id: 'route-line', type: 'line', source: 'routes',
      layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['get', 'priority'] },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['==', ['get', 'priority'], 1], 5, 3.5],
      },
    },
  ],
}
