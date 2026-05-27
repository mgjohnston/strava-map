import { decodePolyline } from './polyline';

describe('decodePolyline', () => {
  it('decodes a simple encoded polyline', () => {
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
    expect(decodePolyline('')).toHaveLength(0);
  });

  it('handles a single point', () => {
    const result = decodePolyline('??');
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBeCloseTo(0, 5);
    expect(result[0][1]).toBeCloseTo(0, 5);
  });
});
