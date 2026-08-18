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

  // Individual pins are the layer that matters most — add them before the
  // count-label layer below, so a font/glyph problem with that cosmetic
  // layer can never again take the actual pins down with it (it did once:
  // addLayer throws synchronously, and everything queued after a failed
  // call in the same function never runs).
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

  try {
    map.addLayer({
      id: 'cluster-count', type: 'symbol', source: 'schools',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
      },
      paint: { 'text-color': '#ffffff' },
    });
  } catch (err) {
    console.warn('cluster-count label layer failed to add (glyphs unavailable); clusters still render without labels', err);
  }
}

export function setPinData(map, geojson) {
  map.getSource('schools').setData(geojson);
}
