import type { Messages } from './so';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : string };

/** English — wixii maqan Af-Soomaali ayaa la muujinayaa. */
const en: DeepPartial<Messages> = {
  common: {
    save: 'Save', cancel: 'Cancel', close: 'Close', confirm: 'Confirm', back: 'Back', search: 'Search', loading: 'Loading…',
    empty: 'No data', yes: 'Yes', no: 'No', edit: 'Edit', add: 'Add', create: 'Create', print: 'Print', reprint: 'Reprint',
    actions: 'Actions', reason: 'Reason', note: 'Note', date: 'Date', from: 'From', to: 'To', total: 'Total', status: 'Status',
    name: 'Name', phone: 'Phone', branch: 'Branch', allBranches: 'All branches', amount: 'Amount', currency: 'Currency',
    active: 'Active', inactive: 'Inactive', refresh: 'Refresh', downloadCsv: 'Download (Excel)', online: 'Online', offline: 'Offline',
    language: 'Af-Soomaali', required: 'Required', saved: 'Saved', done: 'Done', optional: 'optional',
  },
  nav: {
    dashboard: 'Home', trips: 'Trips', bookings: 'Tickets & reservations', parcelsNew: 'Send parcel', parcels: 'Parcels',
    incoming: 'Incoming parcels', outgoing: 'Outgoing parcels', deliver: 'Hand over parcel', cash: 'Cash drawer',
    zaad: 'Zaad reconciliation', voidRequests: 'Void requests', reports: 'Reports', admin: 'Admin', logout: 'Log out', profile: 'Password',
  },
  roles: { SUPER_ADMIN: 'Super Admin', BRANCH_MANAGER: 'Branch manager', CASHIER: 'Cashier', DRIVER: 'Driver' },
  auth: {
    title: 'Sign in', phone: 'Phone number', password: 'Password', submit: 'Sign in', changeTitle: 'Change password',
    changeHint: 'Your password is temporary. Please change it before you start.', current: 'Current password', new: 'New password',
    repeat: 'Repeat new password', mismatch: 'Passwords do not match', rule: 'At least 8 characters, letters and numbers', changed: 'Password changed',
  },
  tripStatus: { SCHEDULED: 'Scheduled', BOARDING: 'Boarding', DEPARTED: 'Departed', ARRIVED: 'Arrived', CLOSED: 'Closed', CANCELLED: 'Cancelled' },
  bookingStatus: { RESERVED: 'Reserved', CONFIRMED: 'Paid', BOARDED: 'Boarded', VOIDED: 'Voided', EXPIRED: 'Expired' },
  parcelStatus: {
    REGISTERED: 'Registered', LOADED: 'Loaded', IN_TRANSIT: 'In transit', ARRIVED: 'Arrived', DELIVERED: 'Delivered',
    VOIDED: 'Voided', MISSING: 'Missing', DAMAGED: 'Damaged',
  },
  payment: {
    title: 'Payment', method: 'Method', reference: 'Transaction number', payerPhone: 'Sent from phone', check: 'Check',
    unused: 'Not used before ✓', used: 'Already used ({usedOn})', sendTo: 'Send to: {number}', paidVia: 'Paid via',
  },
  dashboard: {
    sellTicket: 'Sell ticket', sendParcel: 'Send parcel', handOver: 'Hand over parcel', todayTrips: "Today's trips", incoming: 'Incoming parcels',
    noSession: 'Your cash drawer is not open — you cannot take payments.', openSession: 'Open drawer', sessionOpen: 'Drawer is open',
    revenueToday: 'Revenue today', trips: 'Trips', occupancy: 'Occupancy', awaitingLoad: 'Parcels waiting to load', openSessions: 'Open drawers',
    integrityOk: 'Money & parcels: no issues ✓', integrityIssues: '{n} issue(s) need attention', pendingVoids: 'Pending void requests',
  },
  trips: {
    title: 'Trips', new: 'New trip', route: 'Route', vehicle: 'Vehicle', driver: 'Driver', departure: 'Departure', time: 'Time', seats: 'Seats',
    sold: 'sold', reserved: 'reserved', free: 'free', open: 'Open', manifest: 'Manifest', setStatus: 'Change status',
    toBoarding: 'Start boarding', toDeparted: 'Vehicle departed', toArrived: 'Vehicle arrived', toClosed: 'Close trip', toCancelled: 'Cancel trip',
    move: 'Move passengers to another trip', moveTarget: 'Target trip', moved: '{n} passengers moved', passengers: 'Passengers', parcels: 'Parcels',
    reservedUnpaid: 'Unpaid reservations', codToCollect: 'COD to collect',
  },
  seat: {
    available: 'Free', booked: 'Sold', reserved: 'Reserved', held: 'Being sold by someone else', mine: 'You', driver: 'Driver', front: 'Front',
    pick: 'Pick a seat', holdExpires: 'Seat held for you: {s}s',
  },
  booking: {
    seat: 'Seat', passenger: 'Passenger name', passengerPhone: 'Passenger phone', price: 'Price', discount: 'Discount', sell: 'Sell (paid)',
    reserve: 'Reserve (phone)', reserveHint: 'No payment — seat held until {until}', sold: 'Ticket sold', reservedOk: 'Seat reserved',
    receipt: 'Receipt', reservations: 'Reservations', payNow: 'Pay', cancelReservation: 'Cancel reservation', reservedUntil: 'Until',
    void: 'Void', requestVoid: 'Request void', refund: 'Refund the money', transfer: 'Change seat / trip', correct: 'Fix name / phone',
    board: 'Boarded', filterAll: 'All',
  },
  parcel: {
    newTitle: 'Send parcel', to: 'Destination branch', sender: 'Sender', receiver: 'Receiver', category: 'Category', pieces: 'Pieces',
    weight: 'Weight (kg)', description: 'Description', declared: 'Declared value ($)', fragile: 'Fragile', insured: 'Insured',
    packaging: 'Properly packed', payer: 'Who pays', payerSender: 'Sender (now)', payerReceiver: 'Receiver (on pickup — COD)', fee: 'Fee',
    register: 'Register', registered: 'Parcel registered', pin: 'Receiver PIN', pinHint: 'Write this PIN on the receipt (also sent by SMS)',
    tracking: 'Code', load: 'Load', loadTo: 'Load onto', unload: 'Unload', arriveSelected: 'Confirm received', missing: 'Missing',
    deliverTitle: 'Hand over parcel', deliverSearch: 'Code, phone or name', receivedBy: 'Received by', deliver: 'Hand over',
    delivered: 'Parcel handed over', codDue: 'COD due', storageFee: 'Storage fee', resetPin: 'New PIN (lost)',
    resetPinConfirm: "Did you check the person's ID?", newPin: 'New PIN: {pin}', history: 'History', photo: 'Photo', uploadPhoto: 'Upload photo',
    markMissing: 'Mark missing', markDamaged: 'Mark damaged', prohibited: 'Prohibited — not accepted',
  },
  cash: {
    title: 'Cash drawer', open: 'Open drawer', openingUsd: 'Opening cash (USD)', openingSlsh: 'Opening cash (SLSH)', expected: 'Expected cash',
    countedUsd: 'Counted (USD)', countedSlsh: 'Counted (SLSH)', closeTitle: 'Close drawer', variance: 'Variance', closed: 'Drawer closed',
    byMethod: 'By method', sessions: 'Drawers', approve: 'Approve', forceClose: 'Close (cashier left)', approved: 'Approved',
    expenses: 'Expenses', newExpense: 'New expense', deposits: 'Cash transfers', newDeposit: 'Transfer to office / bank', confirmReceived: 'Received',
  },
  expenseCategory: { FUEL: 'Fuel', DRIVER_ALLOWANCE: 'Driver', MAINTENANCE: 'Maintenance', RENT: 'Rent', UTILITIES: 'Utilities', SALARY: 'Salary', OTHER: 'Other' },
  depositTarget: { HEAD_OFFICE: 'Head office', BANK: 'Bank', MOBILE_MONEY: 'Mobile money' },
  zaad: {
    title: 'Zaad / eDahab reconciliation', hint: 'Compare with the Zaad/eDahab statement, then tick the correct ones.',
    onlyUnreconciled: 'Only unchecked', reconcileSelected: 'Mark as checked', reconciled: 'Checked', receipt: 'Receipt', cashier: 'Cashier',
  },
  voidReq: { title: 'Void requests', approve: 'Approve', reject: 'Reject', requested: 'Request sent' },
  reports: {
    title: 'Reports', dailyClose: 'Daily close', revenue: 'Revenue', tripsProfit: 'Trip profit', integrity: 'Integrity check',
    cashiers: 'Cashier performance', income: 'Income', expenses: 'Expenses', net: 'Net', deposits: 'Transfers', tickets: 'Tickets',
    parcelsSent: 'Parcels sent', delivered: 'Delivered', profit: 'Profit', issuesNone: 'All good ✓', failedSms: 'Failed SMS',
    checks: {
      cashSessionsOpenOver24h: 'Drawer open > 24h', closedSessionsNotApprovedOver48h: 'Closed drawer not approved > 48h',
      senderPaidParcelsWithoutPayment: 'Sender-paid parcel without payment', codDeliveredWithoutPayment: 'COD delivered without payment',
      ticketsWithoutPayment: 'Ticket without payment', depositsUnconfirmedOver72h: 'Transfer unconfirmed > 72h',
      parcelsInTransitOver48h: 'Parcel in transit > 48h', tripsDepartedNotArrivedOver24h: 'Trip departed, not arrived > 24h',
      mobilePaymentsUnreconciledOver48h: 'Zaad/eDahab unchecked > 48h',
    },
  },
  admin: {
    title: 'Admin', branches: 'Branches', routes: 'Routes & prices', vehicles: 'Vehicles', drivers: 'Drivers', users: 'Staff',
    categories: 'Parcel categories', settings: 'Settings', company: 'Company', rate: 'Rate (1 USD = ? SLSH)', code: 'Code', city: 'City',
    zaadNumber: 'Zaad number', edahabNumber: 'eDahab number', ticketPrice: 'Ticket price ($)', frontSurcharge: 'Front seat (+$)',
    perKg: 'Per kg ($)', minFee: 'Minimum ($)', plate: 'Plate', model: 'Model', capacity: 'Seats', license: 'License', role: 'Role',
    password: 'Temporary password', resetPassword: 'Reset password', baseFee: 'Base fee ($)', multiplier: 'Kg multiplier', prohibited: 'Prohibited',
  },
  errors: {
    NETWORK_ERROR: 'No internet or the server cannot be reached.', VALIDATION_ERROR: 'Some fields are invalid.',
    UNAUTHORIZED: 'Wrong phone or password.', SESSION_REVOKED: 'Your session ended — please sign in again.',
    PASSWORD_CHANGE_REQUIRED: 'Change your password first.', TOO_MANY_ATTEMPTS: 'Too many wrong attempts — wait 15 minutes.',
    FORBIDDEN: 'You are not allowed to do this.', FORBIDDEN_BRANCH: 'This belongs to another branch.', NOT_FOUND: 'Not found.',
    SEAT_TAKEN: 'Seat taken — pick another.', SEAT_HELD: 'Someone else is selling this seat.', NO_OPEN_SESSION: 'Open your cash drawer first.',
    MOBILE_REFERENCE_USED: 'This Zaad/eDahab transaction was already used.', PAYER_PHONE_REQUIRED: 'Enter the phone the money was sent from.',
    PAYMENT_REQUIRED: 'Collect the payment first.', INVALID_PIN: 'Wrong PIN.', UNKNOWN: 'Something went wrong.',
  },
};

export default en;
