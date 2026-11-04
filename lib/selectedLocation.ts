import { validateServiceArea } from './validations/serviceArea';

export type SelectedLocationData = {
  address: string;
  area: string;
  lat: number;
  lng: number;
  placeId?: string;
  houseNo?: string;
  street?: string;
  pincode?: string;
  serviceable: boolean;
  zoneName?: string;
};

const LOCATION_STORAGE_KEY = 'jio_selected_location';
export const LOCATION_CHANGE_EVENT = 'jio_location_updated';

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
    const hasValidCoords =
      !isNaN(lat) &&
      !isNaN(lng) &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      (lat !== 0 || lng !== 0);

    const check = validateServiceArea({
      lat: hasValidCoords ? lat : null,
      lng: hasValidCoords ? lng : null,
      area: areaName.trim(),
      address: parsed.address,
      street: parsed.street,
      pincode: parsed.pincode,
    });

    return {
      ...parsed,
      address: parsed.address || areaName,
      area: areaName.trim(),
      lat: hasValidCoords
        ? lat
        : check.zone
          ? check.zone.id === 'btm-layout'
            ? 12.9166
            : 12.9077
          : 0,
      lng: hasValidCoords
        ? lng
        : check.zone
          ? check.zone.id === 'btm-layout'
            ? 77.6101
            : 77.5854
          : 0,
      serviceable: Boolean(check.serviceable && parsed.serviceable !== false),
      zoneName: check.zone?.name || parsed.zoneName,
    };
  } catch {
    return null;
  }
}

export function setSelectedLocation(data: SelectedLocationData): void {
  if (typeof window === 'undefined') return;
  try {
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
