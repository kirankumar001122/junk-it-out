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
    if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number' && parsed.area) {
      return parsed;
    }
    return null;
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
