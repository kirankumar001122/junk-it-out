export type SelectedLocationData = {
  address: string;
  addressSource?: 'places' | 'saved' | 'service-zone' | 'reverse-geocoded';
  area: string;
  lat: number;
  lng: number;
  placeId?: string;
  houseNo?: string;
  building?: string;
  street?: string;
  landmark?: string;
  pincode?: string;
  savedAddressId?: string;
  serviceable: boolean;
  zoneName?: string;
  addressVerified?: boolean;
};

const LOCATION_STORAGE_KEY = 'jio_selected_location';
export const LOCATION_CHANGE_EVENT = 'jio_location_updated';

export function getSelectedAddressSource(location: any): SelectedLocationData['addressSource'] {
  const knownSources = ['places', 'saved', 'service-zone', 'reverse-geocoded'];
  if (knownSources.includes(location?.addressSource)) return location.addressSource;

  const detailedFields = [location?.houseNo, location?.street, location?.pincode]
    .filter((value) => typeof value === 'string' && value.trim());
  return detailedFields.length >= 2 ? 'places' : 'reverse-geocoded';
}

export function getSelectedLocation(): SelectedLocationData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const areaName = parsed.area || parsed.address || parsed.name;
    if (!areaName || typeof areaName !== 'string') return null;

    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);

    return {
      ...parsed,
      address: parsed.address || areaName,
      addressSource: getSelectedAddressSource(parsed),
      area: areaName.trim(),
      lat: !isNaN(lat) ? lat : 12.9716,
      lng: !isNaN(lng) ? lng : 77.5946,
      serviceable: parsed.serviceable ?? true,
    };
  } catch {
    return null;
  }
}

export function setSelectedLocation(data: SelectedLocationData): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getSelectedLocation();
    const comparable = (location: SelectedLocationData | null) => location && ({
      address: location.address?.trim() || '',
      addressSource: location.addressSource || null,
      area: location.area?.trim() || '',
      lat: Number(location.lat),
      lng: Number(location.lng),
      placeId: location.placeId || null,
      houseNo: location.houseNo || null,
      building: location.building || null,
      street: location.street || null,
      landmark: location.landmark || null,
      pincode: location.pincode || null,
      savedAddressId: location.savedAddressId || null,
      serviceable: location.serviceable ?? true,
      zoneName: location.zoneName || null,
      addressVerified: location.addressVerified ?? null,
    });
    if (JSON.stringify(comparable(current)) === JSON.stringify(comparable(data))) return;

    window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent(LOCATION_CHANGE_EVENT, { detail: data }));
  } catch (e) {
    console.error('Failed to store selected location:', e);
  }
}

export function clearSelectedLocation(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LOCATION_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(LOCATION_CHANGE_EVENT, { detail: null }));
  } catch (e) {
    console.error('Failed to clear selected location:', e);
  }
}
