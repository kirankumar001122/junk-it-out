type AddressFields = {
  formattedAddress?: string | null;
  houseNo?: string | null;
  building?: string | null;
  street?: string | null;
  landmark?: string | null;
  area?: string | null;
  city?: string | null;
  pincode?: string | null;
};

export function formatPickupAddress(address?: AddressFields | null) {
  if (!address) return '';

  const formattedAddress = address.formattedAddress?.trim();
  if (formattedAddress) return formattedAddress;

  return [
    [address.houseNo, address.building].filter(Boolean).join(', '),
    address.street,
    address.landmark,
    address.area,
    address.city,
    address.pincode,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

export function preserveConfirmedPickupAddress(confirmedAddress?: string | null, geocodedAddress?: string | null) {
  return confirmedAddress?.trim() || geocodedAddress?.trim() || '';
}

export function resolvePickupAddressAfterPinMove(input: {
  address: string;
  addressSource?: 'places' | 'saved' | 'service-zone' | 'reverse-geocoded';
  geocodedAddress?: string | null;
  geocodeUseful: boolean;
}) {
  const keepConfirmedAddress = input.addressSource === 'places' || input.addressSource === 'saved';
  return {
    address: keepConfirmedAddress || !input.geocodeUseful
      ? preserveConfirmedPickupAddress(input.address, input.geocodedAddress)
      : preserveConfirmedPickupAddress(input.geocodedAddress, input.address),
    addressSource: keepConfirmedAddress
      ? input.addressSource
      : input.geocodeUseful
        ? 'reverse-geocoded' as const
        : input.addressSource,
    addressVerified: input.geocodeUseful,
    keepConfirmedAddress,
  };
}

export function buildBookingAddressPayload(input: {
  label: string;
  houseNo: string;
  building: string;
  street: string;
  area: string;
  fullAddress: string;
  landmark: string;
  pincode: string;
  lat: number;
  lng: number;
  placeId: string | null;
}) {
  return {
    label: input.label,
    houseNo: input.houseNo,
    building: input.building || undefined,
    street: input.street,
    area: input.area,
    formattedAddress: input.fullAddress,
    landmark: input.landmark || undefined,
    pincode: input.pincode,
    lat: input.lat,
    lng: input.lng,
    googlePlaceId: input.placeId,
  };
}

export function buildCustomerAddressPersistenceFields(input: {
  formattedAddress?: string | null;
  houseNo: string;
  building?: string | null;
  street: string;
  area: string;
  landmark?: string | null;
  pincode: string;
  lat: number;
  lng: number;
  googlePlaceId?: string | null;
}) {
  return {
    formattedAddress: input.formattedAddress?.trim() || null,
    houseNo: input.houseNo,
    building: input.building || null,
    street: input.street,
    area: input.area,
    landmark: input.landmark || null,
    pincode: input.pincode,
    lat: input.lat,
    lng: input.lng,
    googlePlaceId: input.googlePlaceId || null,
  };
}
