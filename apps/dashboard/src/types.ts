export type Address = {
  name: string;
  phone: string;
  street: string;
  city: string;
  dane: string;
  department: string;
};
export type Line = { title: string; quantity: number; unitPrice: number };
export type Quote = {
  id: string;
  provider: string;
  carrier: string;
  service: string;
  freight: number;
  codCommission: number;
  businessDays: number;
  simulated: boolean;
  chosen: boolean;
  score: number | null;
};
export type Shipment = {
  id: string;
  trackingNumber: string;
  carrier: string;
  provider: string;
  status: string;
  simulated: boolean;
  total: number;
  trackUrl: string;
  events: Array<{ id: string; status: string; description: string; at: string }>;
};
export type OrderRow = {
  id: string;
  number: string;
  address: Address;
  lines: Line[];
  total: number;
  payment: "cod" | "prepaid";
  status: string;
  createdAt: string;
  shipments: Shipment[];
  quotes: Quote[];
};
export type Connection = { name: string; kind: string; live: boolean; note: string };
export type State = {
  store: { id: string; name: string };
  settings: Settings;
  db: string;
  demo?: boolean;
  connections: Connection[];
  kpis: {
    orders: number;
    shipments: number;
    delivered: number;
    inTransit: number;
    incidents: number;
    pendingApprovals: number;
    shippingSpend: number;
    simulatedShipments: number;
  };
};
export type Approval = {
  id: string;
  orderId: string | null;
  kind: string;
  title: string;
  detail: string;
  status: string;
  createdAt: string;
};
export type Channel = "whatsapp" | "instagram" | "messenger";
export type Conversation = {
  id: string;
  channel: Channel;
  customer: {
    name: string;
    phone: string;
    city: string | null;
    whatsappConsent: boolean;
    optOutAt: string | null;
    orders: Array<{ number: string; total: number; status: string; createdAt: string }>;
  };
  messages: Array<{
    id: string;
    direction: "in" | "out";
    text: string;
    simulated: boolean;
    at: string;
    template: string | null;
  }>;
};
export type Product = {
  id: string;
  title: string;
  price: number;
  cost: number | null;
  marginPct: number | null;
  unitsSold: number;
  revenue: number;
};
export type Campaign = {
  id: string;
  platform: string;
  product: string;
  status: string;
  externalId: string | null;
  createdAt: string;
};
export type DemoOutcome = {
  ok: boolean;
  number: string;
  outcome: { status: string; trackingNumber?: string; carrier?: string };
};

export type Account = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "owner";
  storeId: string;
  tourDone: boolean;
};
export type AuthInfo = {
  account: Account | null;
  login: boolean;
  demo: boolean;
  demoAdmin?: { email: string; password: string };
};

export type Check = {
  id: string;
  group: string;
  title: string;
  status: "pass" | "warn" | "fail" | "na";
  impact: "alto" | "medio" | "bajo";
  evidence: string;
  fix?: string;
};
export type AuditReport = {
  id?: string;
  kind: "seo" | "diseno";
  source: "sample" | "live";
  url: string;
  generatedAt: string;
  score: number | null;
  evaluated: number;
  total: number;
  checks: Check[];
  quickWins: string[];
  notes: string[];
};
export type AuditsResp = {
  seo: AuditReport | null;
  diseno: AuditReport | null;
  history: Record<"seo" | "diseno", Array<{ score: number | null; evaluated: number; at: string }>>;
};

export type ShipRow = {
  id: string;
  trackingNumber: string;
  carrier: string;
  provider: string;
  status: string;
  total: number;
  simulated: boolean;
  labelUrl: string;
  trackUrl: string;
  createdAt: string;
  deliveredAt: string | null;
  lastEvent: string | null;
  order: { id: string; number: string; payment: string; total: number; name: string; city: string };
};
export type ShipDetail = {
  trackingNumber: string;
  carrier: string;
  status: string;
  simulated: boolean;
  events: Array<{ id: string; status: string; description: string; at: string }>;
  order: { number: string; address: Address };
};

export type Overview = {
  days: number;
  series: Array<{ date: string; orders: number; revenue: number }>;
  totals: {
    orders: number;
    revenue: number;
    avgTicket: number | null;
    codShare: number | null;
    deliveredPct: number | null;
    returnedPct: number | null;
    cancelled: number;
  };
};
export type Attribution = {
  sources: Array<{
    source: string;
    orders: number;
    revenue: number;
    deliveredPct: number | null;
    avgTicket: number | null;
  }>;
  campaigns: Array<{
    id: string;
    product: string;
    platform: string;
    status: string;
    utmCampaign: string | null;
    sample: boolean;
    orders: number;
    revenue: number;
    spend: number | null;
    roas: number | null;
    costPerOrder: number | null;
  }>;
};
export type Logistics = {
  carriers: Array<{
    carrier: string;
    shipments: number;
    deliveredPct: number;
    incidentPct: number;
    returnedPct: number;
    avgCost: number;
    avgDays: number | null;
    codCollected: number;
    codInTransit: number;
  }>;
  cod: { collected: number; inTransit: number };
  note: string;
};

export type CampaignFull = {
  id: string;
  platform: "meta" | "google" | "tiktok";
  product: string;
  status: string;
  externalId: string | null;
  createdAt: string;
  sample: boolean;
  metrics: { spend: number; impressions: number; clicks: number; ctr: number; cpc: number } | null;
  payload: {
    dailyBudget: number;
    utmCampaign?: string;
    copy: { headlines: string[]; primaryTexts: string[]; descriptions: string[]; cta: string };
    audience: { cities: string[]; ageMin: number; ageMax: number; interests: string[] };
    creatives: Array<{
      kind: "image" | "video";
      prompt: string;
      generated?: boolean;
      seed?: string;
      assetId?: string;
    }>;
  };
};
export type MediaAsset = {
  id: string;
  kind: "image" | "video";
  title: string;
  source: "subido" | "higgsfield" | "generado";
  role: "ugc" | "producto" | "lifestyle" | "referencia";
  product: string | null;
  seed: string | null;
  url: string | null;
  mime: string | null;
  bytes: number | null;
  durationS: number | null;
  sample: boolean;
  createdAt: string;
};
export type Suggestion = {
  ok: boolean;
  productId: string;
  productTitle: string;
  platform: "meta" | "google" | "tiktok";
  objective: string;
  dailyBudget: number;
  copy: { headlines: string[]; primaryTexts: string[]; descriptions: string[]; cta: string };
  audience: { cities: string[]; ageMin: number; ageMax: number; interests: string[] };
  creatives: Array<{
    kind: "image" | "video";
    prompt: string;
    assetId?: string;
    generated?: boolean;
    seed?: string;
  }>;
  utmCampaign: string;
  credits: { image: number; video: number; total: number };
  rationale: string[];
};
export type AudienceRow = {
  id: string;
  name: string;
  segment: string;
  size: number;
  status: string;
  createdAt: string;
};
export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  whatsappConsent: boolean;
  optOut?: boolean;
  orders: number;
  spent: number;
  lastOrderAt: string | null;
  segments: string[];
};
export type CustomersResp = {
  total: number;
  segments: Record<string, number>;
  customers: CustomerRow[];
};
export type StoreStatus = {
  imported: boolean;
  products: number;
  customers: number;
  orders: number;
  platform: string;
  demo?: boolean;
  connected?: boolean;
  profile: { sample?: boolean; rich?: boolean } | null;
};
export type TemplateRow = { name: string; text: string };
export type Settings = {
  autonomy: 0 | 1;
  maxAutoShipmentCost: number;
  preferredProvider?: string;
  weights: { cost: number; speed: number; reliability: number };
  originDane: string;
  confirmCod: "off" | "risky" | "all";
  riskThreshold: number;
  prepaidDiscountPct: number;
};
