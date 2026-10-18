// Edison, NJ bounding box — biases and restricts geocoding results so a
// pickup address a parent types always resolves somewhere in town.
const EDISON_VIEWBOX = '-74.55,40.60,-74.28,40.44';

export async function geocodeInEdison(query) {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Enter a pickup address first');

  const params = new URLSearchParams({
    format: 'json',
    q: `${trimmed}, Edison, NJ`,
    limit: '1',
    viewbox: EDISON_VIEWBOX,
    bounded: '1',
  });

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  if (!res.ok) throw new Error('Could not look up that address right now — try again in a moment');

  const results = await res.json();
  if (!results.length) {
    throw new Error("Couldn't find that address in Edison, NJ — try adding a house number or street name");
  }

  const match = results[0];
  return {
    name: trimmed,
    lat: parseFloat(match.lat),
    lng: parseFloat(match.lon),
    address: match.display_name,
  };
}
