import {
  computeArrowVisualSpec,
  computeDirectionArrows,
  haversineDistance
} from '@/features/maps';
import { LatLng } from '@/shared';

describe('directionArrows service', () => {
  it('returns empty arrows for undefined, single-point, or zero-distance tracks', () => {
    expect(computeDirectionArrows(undefined).arrows).toHaveLength(0);
    expect(computeDirectionArrows([{ latitude: 45, longitude: 5 }]).arrows).toHaveLength(0);
    expect(
      computeDirectionArrows([
        { latitude: 45, longitude: 5 },
        { latitude: 45, longitude: 5 }
      ]).arrows
    ).toHaveLength(0);
  });

  it('spaces arrows by geodesic distance rather than vertex index on RDP-simplified tracks', () => {
    // 8 dense points in the first ~70m, then a single 2km straight segment due North
    const track: LatLng[] = [
      { latitude: 45.0, longitude: 5.0 },
      { latitude: 45.0001, longitude: 5.0 },
      { latitude: 45.0002, longitude: 5.0 },
      { latitude: 45.0003, longitude: 5.0 },
      { latitude: 45.0004, longitude: 5.0 },
      { latitude: 45.0005, longitude: 5.0 },
      { latitude: 45.0006, longitude: 5.0 },
      { latitude: 45.0007, longitude: 5.0 },
      { latitude: 45.02, longitude: 5.0 } // ~2.2 km North
    ];

    const { arrows } = computeDirectionArrows(track, { baseArrowCount: 5 });
    expect(arrows).toHaveLength(5);

    // Every arrow should lie past the initial 70m cluster (latitude > 45.002)
    // and point due North (bearing ~0 deg)
    for (const arrow of arrows) {
      expect(arrow.coordinate.latitude).toBeGreaterThan(45.002);
      expect(arrow.bearing).toBeCloseTo(0, 1);
    }

    // Arrows should be evenly spaced in distance (~370m apart)
    for (let i = 1; i < arrows.length; i++) {
      const gap = arrows[i].distanceMeters - arrows[i - 1].distanceMeters;
      expect(gap).toBeGreaterThan(300);
      expect(gap).toBeLessThan(440);
    }
  });

  it('de-conflicts outbound and return arrows on an out-and-back route and avoids the turnaround apex', () => {
    // Outbound 1.5km East, then 1.5km West along the exact same line
    const track: LatLng[] = [
      { latitude: 45.0, longitude: 5.0 },
      { latitude: 45.0, longitude: 5.02 }, // turnaround apex
      { latitude: 45.0, longitude: 5.0 }
    ];

    const { arrows } = computeDirectionArrows(track, { baseArrowCount: 5 });
    expect(arrows.length).toBeGreaterThanOrEqual(4);

    // No two arrows should sit at the same physical location
    for (let i = 0; i < arrows.length; i++) {
      for (let j = i + 1; j < arrows.length; j++) {
        const separation = haversineDistance(arrows[i].coordinate, arrows[j].coordinate);
        expect(separation).toBeGreaterThan(40);
      }
      // None should sit right on the turnaround apex (longitude 5.02)
      const distToApex = haversineDistance(arrows[i].coordinate, {
        latitude: 45.0,
        longitude: 5.02
      });
      expect(distToApex).toBeGreaterThan(30);
    }
  });

  it('staggers overlay arrows away from occupied primary arrow coordinates', () => {
    const track: LatLng[] = [
      { latitude: 45.0, longitude: 5.0 },
      { latitude: 45.02, longitude: 5.0 }
    ];

    const primary = computeDirectionArrows(track, { baseArrowCount: 5 });
    const overlay = computeDirectionArrows(track, {
      baseArrowCount: 5,
      isOverlay: true,
      occupiedCoordinates: primary.arrows.map(a => a.coordinate)
    });

    expect(primary.arrows).toHaveLength(5);
    expect(overlay.arrows).toHaveLength(5);

    for (const pArrow of primary.arrows) {
      for (const oArrow of overlay.arrows) {
        expect(haversineDistance(pArrow.coordinate, oArrow.coordinate)).toBeGreaterThan(30);
      }
    }
  });

  it('adapts badge size and target count to zoom level and focuses arrows in zoomed-in region', () => {
    const track: LatLng[] = [
      { latitude: 45.0, longitude: 5.0 },
      { latitude: 45.1, longitude: 5.0 } // ~11.1 km North
    ];

    const zoomedOutSpec = computeArrowVisualSpec(
      2_800,
      { latitude: 45.05, longitude: 5.0, latitudeDelta: 0.25, longitudeDelta: 0.25 },
      5,
      false
    );
    const defaultSpec = computeArrowVisualSpec(2_800, null, 5, false);
    const zoomedInSpec = computeArrowVisualSpec(
      11_000,
      { latitude: 45.02, longitude: 5.0, latitudeDelta: 0.015, longitudeDelta: 0.015 },
      5,
      false
    );

    expect(zoomedOutSpec.badgeSize).toBeLessThan(defaultSpec.badgeSize);
    expect(zoomedOutSpec.targetCount).toBeLessThan(defaultSpec.targetCount);
    expect(zoomedInSpec.badgeSize).toBeGreaterThan(defaultSpec.badgeSize);

    // When zoomed into the southern quarter of the 11km track, placed arrows stay inside that sub-region
    const zoomedInResult = computeDirectionArrows(track, {
      baseArrowCount: 5,
      region: {
        latitude: 45.02,
        longitude: 5.0,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02
      }
    });

    expect(zoomedInResult.arrows.length).toBeGreaterThanOrEqual(3);
    for (const arrow of zoomedInResult.arrows) {
      expect(arrow.coordinate.latitude).toBeGreaterThanOrEqual(45.005);
      expect(arrow.coordinate.latitude).toBeLessThanOrEqual(45.035);
    }
  });
});
