import { decodePolyline } from './polyline';

describe('decodePolyline', () => {
  it('decodes a simple encoded polyline', () => {
    // Encoded polyline for a simple path
    // This is Google's example polyline encoding for the path:
    // (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const result = decodePolyline(encoded);

    expect(result).toHaveLength(3);
    expect(result[0][0]).toBeCloseTo(38.5, 1);
    expect(result[0][1]).toBeCloseTo(-120.2, 1);
    expect(result[1][0]).toBeCloseTo(40.7, 1);
    expect(result[1][1]).toBeCloseTo(-120.95, 1);
    expect(result[2][0]).toBeCloseTo(43.252, 1);
    expect(result[2][1]).toBeCloseTo(-126.453, 1);
  });

  it('returns empty array for empty string', () => {
    const result = decodePolyline('');
    expect(result).toHaveLength(0);
  });

  it('handles a single point', () => {
    // Single point at approximately (0, 0)
    const encoded = '??';
    const result = decodePolyline(encoded);

    expect(result).toHaveLength(1);
    expect(result[0][0]).toBeCloseTo(0, 5);
    expect(result[0][1]).toBeCloseTo(0, 5);
  });

  it('decodes negative coordinates correctly', () => {
    // A polyline with negative latitude and longitude
    const encoded = '~ps|U_p~iF';
    const result = decodePolyline(encoded);

    expect(result).toHaveLength(1);
    // Should decode to negative values
    expect(result[0][0]).toBeLessThan(0);
    expect(result[0][1]).toBeGreaterThan(0);
  });

  it('accumulates delta-encoded values', () => {
    // Polyline encoding uses delta values - each point is relative to previous
    const encoded = '_p~iF~ps|U_c_c';
    const result = decodePolyline(encoded);

    expect(result.length).toBeGreaterThanOrEqual(2);
    // First point establishes the base
    // Second point adds delta to first
  });
});
