import {CoordinateHelper} from './coordinate.helper';

describe('CoordinateHelper.parseCoordinate', () => {
  it('accetta il punto e la virgola come separatore decimale', () => {
    expect(CoordinateHelper.parseCoordinate('42.514025')).toBe(42.514025);
    expect(CoordinateHelper.parseCoordinate('42,514025')).toBe(42.514025);
    expect(CoordinateHelper.parseCoordinate('-14,2')).toBe(-14.2);
  });

  it('valori assenti o non numerici: NaN', () => {
    expect(CoordinateHelper.parseCoordinate(null)).toBeNaN();
    expect(CoordinateHelper.parseCoordinate(undefined)).toBeNaN();
    expect(CoordinateHelper.parseCoordinate('')).toBeNaN();
    expect(CoordinateHelper.parseCoordinate('abc')).toBeNaN();
  });
});
