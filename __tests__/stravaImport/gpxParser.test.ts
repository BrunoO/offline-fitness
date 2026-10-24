import { gpxToStream, parseGpx, toStreamSet } from '@/features/strava-import/services/gpxParser';

/**
 * Track files in a Strava export are `StravaGPX` documents with one `<trkpt>`
 * per second. The parser must produce the three streams the app consumes
 * (`latlng`, `altitude`, `time`) in the same JSON shape as the Strava API.
 */

const SAMPLE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <metadata>
  <time>2023-10-15T05:50:05Z</time>
 </metadata>
 <trk>
  <name>Marche matinale</name>
  <type>walking</type>
  <trkseg>
   <trkpt lat="44.9054280" lon="5.7898060">
    <ele>864.0</ele>
    <time>2023-10-15T05:50:05Z</time>
    <extensions>
     <gpxtpx:TrackPointExtension>
      <gpxtpx:cad>0</gpxtpx:cad>
     </gpxtpx:TrackPointExtension>
    </extensions>
   </trkpt>
   <trkpt lat="44.9054060" lon="5.7897890">
    <ele>864.1</ele>
    <time>2023-10-15T05:50:06Z</time>
   </trkpt>
  </trkseg>
  <trkseg>
   <trkpt lat="44.9054020" lon="5.7897810">
    <ele>867.25</ele>
    <time>2023-10-15T05:50:09Z</time>
   </trkpt>
  </trkseg>
 </trk>
</gpx>`;

describe('parseGpx', () => {
  it('reads metadata, every segment and the time of each point', () => {
    const parsed = parseGpx(SAMPLE_GPX);

    expect(parsed.name).toBe('Marche matinale');
    expect(parsed.type).toBe('walking');
    expect(parsed.points).toHaveLength(3);
    expect(parsed.points[0]).toEqual({
      lat: 44.905428,
      lon: 5.789806,
      ele: 864,
      timeMs: Date.UTC(2023, 9, 15, 5, 50, 5),
      hr: null
    });
    expect(parsed.points[2].ele).toBeCloseTo(867.25);
  });

  it('returns no points for a metadata-only GPX (activity without GPS)', () => {
    const emptyGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
 <metadata>
  <time>2023-10-15T05:03:05Z</time>
 </metadata>
</gpx>`;
    expect(parseGpx(emptyGpx).points).toHaveLength(0);
  });

  it('drops points without a timestamp so streams stay index-aligned', () => {
    const gpx = `<gpx><trk><trkseg>
      <trkpt lat="1" lon="2"><ele>3</ele></trkpt>
      <trkpt lat="1.1" lon="2.1"><ele>3.1</ele><time>2023-10-15T05:50:05Z</time></trkpt>
    </trkseg></trk></gpx>`;
    const parsed = parseGpx(gpx);
    expect(parsed.points).toHaveLength(1);
    expect(parsed.points[0].lat).toBeCloseTo(1.1);
  });

  it('drops self-closing <trkpt/> points without swallowing the next point', () => {
    const gpx = `<gpx><trk><trkseg>
      <trkpt lat="45.1" lon="6.1"/>
      <trkpt lat="45.2" lon="6.2"><ele>210.0</ele><time>2023-10-15T05:50:05Z</time></trkpt>
      <trkpt lat="45.3" lon="6.3"><ele>211.0</ele><time>2023-10-15T05:50:06Z</time></trkpt>
    </trkseg></trk></gpx>`;
    const parsed = parseGpx(gpx);
    expect(parsed.points).toEqual([
      {
        lat: 45.2,
        lon: 6.2,
        ele: 210,
        timeMs: Date.UTC(2023, 9, 15, 5, 50, 5),
        hr: null
      },
      {
        lat: 45.3,
        lon: 6.3,
        ele: 211,
        timeMs: Date.UTC(2023, 9, 15, 5, 50, 6),
        hr: null
      }
    ]);
  });

  it('keeps timestamps monotonic when segments overlap', () => {
    const gpx = `<gpx><trk>
      <trkseg>
        <trkpt lat="1" lon="2"><time>2023-10-15T05:50:10Z</time></trkpt>
      </trkseg>
      <trkseg>
        <trkpt lat="3" lon="4"><time>2023-10-15T05:50:02Z</time></trkpt>
      </trkseg>
    </trk></gpx>`;
    const parsed = parseGpx(gpx);
    expect(parsed.points[1].timeMs).toBe(parsed.points[0].timeMs);
  });

  it('unescapes track names', () => {
    const gpx = '<gpx><trk><name>Col &amp; lac</name><trkseg/></trk></gpx>';
    expect(parseGpx(gpx).name).toBe('Col & lac');
  });
});

describe('toStreamSet', () => {
  it('produces API-shaped latlng/altitude/time streams with second offsets', () => {
    const converted = toStreamSet(parseGpx(SAMPLE_GPX).points);

    expect(converted).toEqual(
      expect.objectContaining({ stream: expect.any(Object), startLatLng: expect.any(Array), endLatLng: expect.any(Array) })
    );
    const { stream, startLatLng, endLatLng } = converted!;

    expect(stream.latlng.data).toEqual([
      [44.905428, 5.789806],
      [44.905406, 5.789789],
      [44.905402, 5.789781]
    ]);
    expect(stream.altitude.data).toEqual([864, 864.1, 867.3]);
    expect(stream.time.data).toEqual([0, 1, 4]);
    expect(stream.latlng.original_size).toBe(3);
    expect(startLatLng).toEqual([44.905428, 5.789806]);
    expect(endLatLng).toEqual([44.905402, 5.789781]);
  });

  it('returns undefined when there is no track', () => {
    expect(toStreamSet([])).toBeUndefined();
  });

  it('uses 0 for missing elevation, matching the API', () => {
    const converted = gpxToStream(
      '<gpx><trk><trkseg><trkpt lat="1" lon="2"><time>2023-10-15T05:50:05Z</time></trkpt></trkseg></trk></gpx>'
    );
    expect(converted!.stream.altitude.data).toEqual([0]);
  });

  it('omits the heart-rate series when no point carries one', () => {
    const converted = gpxToStream(SAMPLE_GPX);
    expect(converted!.stream.heartrate).toBeUndefined();
  });

  it('keeps heart-rate gaps as null so they are not read as 0 bpm', () => {
    const gpx = `<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><trkseg>
      <trkpt lat="45.1" lon="6.1"><time>2023-10-15T05:50:05Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>98</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
      <trkpt lat="45.2" lon="6.2"><time>2023-10-15T05:50:06Z</time></trkpt>
      <trkpt lat="45.3" lon="6.3"><time>2023-10-15T05:50:07Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>112</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    </trkseg></trk></gpx>`;
    const converted = gpxToStream(gpx);

    expect(converted!.stream.heartrate?.data).toEqual([98, null, 112]);
    expect(converted!.stream.heartrate?.original_size).toBe(3);
    expect(converted!.stream.time.data).toHaveLength(3);
  });
});
