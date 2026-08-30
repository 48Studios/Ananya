export interface ShippingCarrierOption {
  code: string;
  name: string;
  category: "Indian Domestic" | "International" | "Other";
  buildTrackingUrl?: (trackingNo: string) => string;
}

export const SHIPPING_PROVIDERS: ShippingCarrierOption[] = [
  {
    code: "BLUEDART",
    name: "Blue Dart Express",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `https://www.bluedart.com/trackdartresultthirdparty?trackFor=0&trackNo=${encodeURIComponent(n)}`,
  },
  {
    code: "DELHIVERY",
    name: "Delhivery",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `https://www.delhivery.com/track/package/${encodeURIComponent(n)}`,
  },
  {
    code: "DTDC",
    name: "DTDC India",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `https://www.dtdc.in/tracking/tracking_results.asp?trkType=awb&strCnno=${encodeURIComponent(n)}`,
  },
  {
    code: "TRACKON",
    name: "Trackon Couriers",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `https://trackon.in/Tracking/TrackShipment?awb=${encodeURIComponent(n)}`,
  },
  {
    code: "XPRESSBEES",
    name: "Xpressbees",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `https://www.xpressbees.com/shipment/tracking?awb=${encodeURIComponent(n)}`,
  },
  {
    code: "SHADOWFAX",
    name: "Shadowfax",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `https://tracker.shadowfax.in/#/track?tracking_id=${encodeURIComponent(n)}`,
  },
  {
    code: "ECOM_EXPRESS",
    name: "Ecom Express",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `https://ecomexpress.in/tracking/?awb_field=${encodeURIComponent(n)}`,
  },
  {
    code: "INDIA_POST",
    name: "India Post (Speed Post)",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?consNo=${encodeURIComponent(n)}`,
  },
  {
    code: "EKART",
    name: "Ekart Logistics",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `https://ekartlogistics.com/shipmenttrack/${encodeURIComponent(n)}`,
  },
  {
    code: "PROFESSIONAL",
    name: "The Professional Couriers (TPC)",
    category: "Indian Domestic",
    buildTrackingUrl: () => `https://www.tpcindia.com/`,
  },
  {
    code: "SAFEXPRESS",
    name: "Safexpress",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `http://www.safexpress.com/track-and-trace?waybillNo=${encodeURIComponent(n)}`,
  },
  {
    code: "VRL",
    name: "VRL Logistics",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `https://www.vrlgroup.in/track_consignment.aspx?lrno=${encodeURIComponent(n)}`,
  },
  {
    code: "TCI_EXPRESS",
    name: "TCI Express",
    category: "Indian Domestic",
    buildTrackingUrl: (n) =>
      `https://www.tciexpress.in/tracking.aspx?docket=${encodeURIComponent(n)}`,
  },
  {
    code: "GATI",
    name: "Gati-KWE",
    category: "Indian Domestic",
    buildTrackingUrl: () => `https://www.gatikwe.com/`,
  },
  {
    code: "DHL",
    name: "DHL Express",
    category: "International",
    buildTrackingUrl: (n) =>
      `https://www.dhl.com/in-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(n)}`,
  },
  {
    code: "FEDEX",
    name: "FedEx",
    category: "International",
    buildTrackingUrl: (n) =>
      `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  },
  {
    code: "UPS",
    name: "UPS",
    category: "International",
    buildTrackingUrl: (n) =>
      `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  },
  {
    code: "OTHER",
    name: "Other / Custom Carrier",
    category: "Other",
  },
];

export function getAutoTrackingUrl(
  shippingProvider?: string | null,
  trackingNumber?: string | null,
  customUrl?: string | null,
): string | null {
  if (customUrl && customUrl.trim()) return customUrl.trim();
  if (!trackingNumber || !trackingNumber.trim()) return null;

  const provider = SHIPPING_PROVIDERS.find(
    (p) => p.code.toUpperCase() === shippingProvider?.toUpperCase(),
  );

  if (provider && provider.buildTrackingUrl) {
    return provider.buildTrackingUrl(trackingNumber.trim());
  }

  return null;
}

export function getShippingProviderName(code?: string | null): string {
  if (!code) return "—";
  const found = SHIPPING_PROVIDERS.find(
    (p) => p.code.toUpperCase() === code.toUpperCase(),
  );
  return found ? found.name : code;
}
