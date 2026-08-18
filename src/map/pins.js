export const PIN_COLORS = {
  no_girls_toilet: '#e0473e',
  girls_toilet_nonfunctional: '#f0932b',
};

export function addPinLayers(map) {
  map.addSource('schools', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 11,
  });

  map.addLayer({
    id: 'clusters', type: 'circle', source: 'schools',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#e0473e',
      'circle-opacity': 0.75,
      'circle-radius': ['step', ['get', 'point_count'], 14, 50, 20, 500, 28],
    },
  });

  map.addLayer({
    id: 'cluster-count', type: 'symbol', source: 'schools',
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
    paint: { 'text-color': '#ffffff' },
  });

  map.addLayer({
    id: 'pins', type: 'circle', source: 'schools',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 6,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(0,0,0,0.5)',
      'circle-color': [
        'match', ['get', 'indicator'],
        'no_girls_toilet', PIN_COLORS.no_girls_toilet,
        'girls_toilet_nonfunctional', PIN_COLORS.girls_toilet_nonfunctional,
        '#7c766d',
      ],
    },
  });
}

export function setPinData(map, geojson) {
  map.getSource('schools').setData(geojson);
}
