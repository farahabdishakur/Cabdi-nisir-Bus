/** Qaababka xogta backend-ka (kuwa website-ku isticmaalo). Lacag = senti (USD) / shilin (SLSH) — integer. */

export type Role = 'SUPER_ADMIN' | 'BRANCH_MANAGER' | 'CASHIER' | 'DRIVER';
export type Method = 'CASH' | 'ZAAD' | 'EDAHAB';
export type Currency = 'USD' | 'SLSH';
export type TripStatus = 'SCHEDULED' | 'BOARDING' | 'DEPARTED' | 'ARRIVED' | 'CLOSED' | 'CANCELLED';
export type BookingStatus = 'RESERVED' | 'CONFIRMED' | 'BOARDED' | 'VOIDED' | 'EXPIRED';
export type ParcelStatus = 'REGISTERED' | 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED' | 'VOIDED' | 'MISSING' | 'DAMAGED';

export interface Branch {
  id: string;
  code: string;
  name: string;
  city: string;
  phones: string[];
  zaadNumber: string | null;
  edahabNumber: string | null;
  isActive: boolean;
}

export interface Route {
  id: string;
  fromBranchId: string;
  toBranchId: string;
  fromBranch?: Branch;
  toBranch?: Branch;
  ticketPriceCents: number;
  frontSeatSurchargeCents: number;
  parcelPerKgCents: number;
  parcelMinFeeCents: number;
  isActive: boolean;
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  capacity: number;
  seatLayout: { rows: (string | null)[][]; front?: string[] };
  isActive: boolean;
  /** Lambarka baska ee shirkadda ("02", "13", "3G") */
  fleetNo?: string | null;
  blockReason?: string | null;
  blockedAt?: string | null;
  defaultDriverId?: string | null;
  defaultDriver?: { id: string; name: string; phone?: string } | null;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  licenseNo: string | null;
  branchId: string | null;
  userId: string | null;
  isActive: boolean;
  blockReason?: string | null;
  blockedAt?: string | null;
}

export interface Trip {
  id: string;
  routeId: string;
  route: Route & { fromBranch: Branch; toBranch: Branch };
  vehicle: Vehicle;
  driver: Driver;
  departureAt: string;
  status: TripStatus;
  seatsSold?: number;
  seatsReserved?: number;
  seatsAvailable?: number;
}

export interface Payment {
  id: string;
  kind: 'TICKET' | 'PARCEL' | 'REFUND' | 'STORAGE' | 'EXPENSE' | 'DEPOSIT' | 'TRANSFER_DIFF';
  method: Method;
  currency: Currency;
  amount: number;
  amountUsdCents: number;
  reference: string | null;
  payerPhone: string | null;
  branchId: string;
  createdAt: string;
}

export interface PriceLine {
  label: string;
  cents: number;
}

export interface Booking {
  id: string;
  receiptNo: string;
  tripId: string;
  trip?: Trip;
  seatNo: string;
  passengerName: string;
  passengerPhone: string;
  priceCents: number;
  discountCents: number;
  priceBreakdown: { lines: PriceLine[]; totalCents: number };
  status: BookingStatus;
  branchId: string;
  reservedUntil: string | null;
  printCount: number;
  paperTicketNo?: string | null;
  payments: Payment[];
  createdAt: string;
}

export interface Category {
  id: string;
  nameSo: string;
  nameEn: string;
  baseFeeCents: number;
  perKgMultiplier: string | number;
  isProhibited: boolean;
  isActive: boolean;
}

export interface Parcel {
  id: string;
  trackingCode: string;
  receiptNo: string;
  fromBranchId: string;
  toBranchId: string;
  fromBranch: Branch;
  toBranch: Branch;
  tripId: string | null;
  trip?: { id: string; departureAt: string; status: TripStatus; vehicle: { plate: string } } | null;
  senderName: string;
  senderPhone: string;
  receiverName: string;
  receiverPhone: string;
  category: Category;
  pieces: number;
  weightKg: string | number;
  description: string | null;
  declaredValueCents: number | null;
  isFragile: boolean;
  insured: boolean;
  payer: 'SENDER' | 'RECEIVER';
  feeCents: number;
  priceBreakdown: { lines: PriceLine[]; totalCents: number };
  paidAt: string | null;
  status: ParcelStatus;
  deliveredToName: string | null;
  deliveredAt: string | null;
  arrivedAt: string | null;
  photoUrl: string | null;
  printCount: number;
  payments: Payment[];
  createdAt: string;
  offlineCreatedAt: string | null;
  history?: { id: string; fromStatus: ParcelStatus | null; toStatus: ParcelStatus; note: string | null; createdAt: string }[];
  storageFeeCents?: number;
  pickupPin?: string | null;
}

export interface SeatState {
  seatNo: string;
  state: 'AVAILABLE' | 'HELD' | 'HELD_BY_ME' | 'BOOKED' | 'RESERVED';
  expiresAt?: string;
  reservedUntil?: string;
  booking?: { id: string; receiptNo: string; passengerName: string; status: BookingStatus };
}

export interface SeatMapData {
  tripId: string;
  status: TripStatus;
  layout: { rows: (string | null)[][]; front?: string[] };
  seats: SeatState[];
}

export interface CashSession {
  id: string;
  branchId: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: { USD: number; SLSH: number };
  expected: { USD: number; SLSH: number } | null;
  counted: { USD: number; SLSH: number } | null;
  variance: { USD: number; SLSH: number } | null;
  approvedAt: string | null;
  summary?: {
    expectedCash: { USD: number; SLSH: number };
    byMethod: { method: Method; currency: Currency; count: number; amount: number; amountUsdCents: number }[];
    totalUsdCents: number;
  };
}

export interface Company {
  name: string;
  tagline: string;
  mission: string;
  slogans: string[];
  passengerRules: string[];
  parcelRules: string[];
  receiptFooter: string;
  logoUrl?: string | null;
}

export interface Paged<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

export interface PaymentInput {
  method: Method;
  currency: Currency;
  reference?: string;
  payerPhone?: string;
}

export type MediaStage = 'REGISTER' | 'LOAD' | 'ARRIVE' | 'DELIVER' | 'DAMAGE' | 'CLAIM' | 'OTHER';
export interface ParcelMedia {
  id: string;
  parcelId: string;
  stage: MediaStage;
  kind: 'PHOTO' | 'VIDEO';
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  note: string | null;
  claimId: string | null;
  createdAt: string;
  takenBy: string | null;
  branchCode: string | null;
}
export type ClaimType = 'DAMAGED' | 'MISSING' | 'WRONG_ITEM' | 'INCOMPLETE' | 'LATE' | 'OTHER';
export type ClaimStatus = 'OPEN' | 'ACCEPTED' | 'REJECTED';
export interface ParcelClaim {
  id: string;
  claimNo: string;
  parcelId: string;
  type: ClaimType;
  description: string;
  claimantName: string;
  claimantPhone: string;
  claimedAmountCents: number | null;
  status: ClaimStatus;
  resolution: string | null;
  compensationCents: number | null;
  resolvedAt: string | null;
  createdAt: string;
  parcel?: { id: string; trackingCode: string; status: ParcelStatus; senderName: string; receiverName: string; feeCents: number; declaredValueCents: number | null };
}

export type DispatchStatus = 'WAITING' | 'LOADING' | 'DEPARTED' | 'REMOVED';
export interface DispatchEntry {
  id: string;
  routeId: string;
  serviceDate: string;
  position: number;
  status: DispatchStatus;
  tripId: string | null;
  note: string | null;
  removedReason: string | null;
  loadingAt: string | null;
  departedAt: string | null;
  vehicle: { id: string; plate: string; fleetNo?: string | null; model: string; capacity: number };
  driver: { id: string; name: string; phone: string };
  trip: { id: string; status: TripStatus; departureAt: string; taken: number; capacity: number; full: boolean } | null;
}
export interface DispatchCandidate {
  vehicleId: string;
  plate: string;
  fleetNo?: string | null;
  model: string;
  capacity: number;
  defaultDriver: { id: string; name: string; phone?: string } | null;
  lastDepartedAt: string | null;
}
export interface DispatchBoard {
  route: { id: string; from: Branch; to: Branch; ticketPriceCents: number };
  date: string;
  entries: DispatchEntry[];
  stats: { waiting: number; loading: number; departed: number; passengers: number };
  candidates: DispatchCandidate[];
}
export interface DispatchOverview {
  date: string;
  routes: { route: { id: string; from: Branch; to: Branch }; loading: { plate: string; fleetNo?: string | null; driver: string; driverPhone?: string; tripId: string | null; taken: number; capacity: number }[]; stats: DispatchBoard['stats']; next: string[] }[];
}

/** "13 · SL-1234" — lambarka baska marka hore (jadwalka), kadib taarikada */
export function busLabel(v: { plate: string; fleetNo?: string | null }): string {
  return v.fleetNo ? `${v.fleetNo} · ${v.plate}` : v.plate;
}
