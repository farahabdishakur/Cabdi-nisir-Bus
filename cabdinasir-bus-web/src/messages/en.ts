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
    zaad: 'Zaad reconciliation', voidRequests: 'Void requests', reports: 'Reports', admin: 'Admin', logout: 'Log out', profile: 'Password', system: 'System', offline: 'Offline (pending)',
  },
  roles: { SUPER_ADMIN: 'Super Admin', BRANCH_MANAGER: 'Branch manager', CASHIER: 'Cashier', DRIVER: 'Driver' },
  auth: {
    title: 'Sign in', phone: 'Phone number', password: 'Password', submit: 'Sign in', changeTitle: 'Change password',
    changeHint: 'Your password is temporary. Please change it before you start.', current: 'Current password', new: 'New password',
    repeat: 'Repeat new password', mismatch: 'Passwords do not match', rule: 'At least 8 characters, letters and numbers', changed: 'Password changed',
    idle: 'You were signed out after 30 minutes of inactivity (security). Please sign in again.',
  },
  offline: {
    title: 'Offline parcels', banner: 'No internet. You can still register parcels — they are saved and sent automatically when the internet returns. Tickets & hand-over need internet.',
    hintOnline: 'Offline parcels are sent automatically every minute. Do not close the tab or computer while they are pending.', saved: 'Saved (offline)',
    savedHint: 'No internet — the parcel was saved. When the internet returns it gets its real code and the receiver gets an SMS.',
    estimate: 'Offline estimate — the server decides when synced', pending: 'Pending', syncNow: 'Send now', syncResult: '{synced} sent · {failed} failed',
    receiptNote: 'the real code will be sent by SMS',
  },
  public: {
    track: 'Track parcel', schedule: 'Departures', contact: 'Contact our branches', trackTitle: 'Track your parcel', last4: 'Last 4 digits of the phone',
    trackHint: 'The code is on your receipt or SMS. Enter the last 4 digits of the receiver or sender phone.',
    readyForPickup: 'Your parcel is ready at {to}. Bring the PIN (SMS) and your ID.', amountDue: 'Amount due on pickup: {amount}',
    noTrips: 'No open departures on this day.', seatsLeft: '{n} seats left', full: 'Full',
    howToBook: 'To reserve a seat call a branch (numbers below) or visit the office. You can pay by Zaad / eDahab.', trackOnline: 'Track online',
  },
  search: { placeholder: 'Receipt (BO1-T-…), parcel code (CB-…), phone or name', short: 'Search… (/)' },
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
    reservedUnpaid: 'Unpaid reservations', codToCollect: 'COD to collect', edit: 'Edit trip', schedule: 'Daily schedule', addRow: 'Add trip', created: '{n} / {total} trips created', viewOnly: 'Tickets for this trip are sold in its departure city — view only.',
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
    board: 'Boarded', filterAll: 'All', diffDue: 'Price difference to pay',
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
  voidReq: { title: 'Void requests', approve: 'Approve', reject: 'Reject', requested: 'Request sent', PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' },
  priceLine: { base_fee: 'Base fee', weight: 'Weight ({kg} kg)', fragile: 'Fragile', insurance: 'Insurance', minimum_fee_adjustment: 'Minimum fee adjustment', route_fare: 'Fare', front_seat: 'Front seat', discount: 'Discount', estimate: 'Estimate (offline)' },
  paymentKind: { TICKET: 'Ticket', PARCEL: 'Parcel', REFUND: 'Refund', STORAGE: 'Storage', EXPENSE: 'Expense', DEPOSIT: 'Transfer', TRANSFER_DIFF: 'Change difference' },
  settingsField: {
    fragileSurchargeCents: 'Fragile surcharge (+$)', storageFeePerDayCents: 'Storage per day ($)', insuranceBps: 'Insurance (bps)', maxDiscountBps: 'Max discount (bps)',
    seatHoldSeconds: 'Seat hold (seconds)', uncollectedDays: 'Free storage days', reservationCutoffMinutes: 'Reservation cutoff (minutes before departure)',
    maxReservationsPerPhone: 'Reservations per phone', shareTripsWithinCity: 'Branches in the same city share trips (1/0)',
  },
  company: { tagline: 'Tagline', mission: 'Mission', slogans: 'Slogans', passengerRules: 'Passenger rules', parcelRules: 'Parcel rules', receiptFooter: 'Receipt footer', oneLine: 'One line = one rule' },
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
  system: {
    title: 'System', audit: 'Audit log (who did what)', sms: 'SMS messages', health: 'Server health', who: 'Who', action: 'Action', what: 'What',
    message: 'Message', retry: 'Retry', uptime: 'Uptime', jobsOff: 'Background jobs are off (JOBS_ENABLED).', smsFailed: '{n} SMS failed — check the SMS provider.',
  },
  admin: {
    title: 'Admin', branches: 'Branches', routes: 'Routes & prices', vehicles: 'Vehicles', drivers: 'Drivers', users: 'Staff',
    categories: 'Parcel categories', settings: 'Settings', company: 'Company', rate: 'Rate (1 USD = ? SLSH)', code: 'Code', city: 'City',
    zaadNumber: 'Zaad number', edahabNumber: 'eDahab number', ticketPrice: 'Ticket price ($)', frontSurcharge: 'Front seat (+$)',
    perKg: 'Per kg ($)', minFee: 'Minimum ($)', plate: 'Plate', model: 'Model', capacity: 'Seats', license: 'License', role: 'Role',
    password: 'Temporary password', resetPassword: 'Reset password', baseFee: 'Base fee ($)', multiplier: 'Kg multiplier', prohibited: 'Prohibited', seatLayout: 'Seat layout (JSON)', nameEn: 'Name (English)', account: 'Driver account',
    accountHint: 'A DRIVER login (Staff) so the driver can see the manifest on a phone', editUserHint: 'Changing role or branch signs the person out.',
  },
  errors: {
    NETWORK_ERROR: 'No internet or the server cannot be reached.', VALIDATION_ERROR: 'Some fields are invalid.',
    UNAUTHORIZED: 'Wrong phone or password.', SESSION_REVOKED: 'Your session ended — please sign in again.',
    PASSWORD_CHANGE_REQUIRED: 'Change your password first.', TOO_MANY_ATTEMPTS: 'Too many wrong attempts — wait 15 minutes.',
    FORBIDDEN: 'You are not allowed to do this.', FORBIDDEN_BRANCH: 'This belongs to another branch.', NOT_FOUND: 'Not found.',
    SEAT_TAKEN: 'Seat taken — pick another.', SEAT_HELD: 'Someone else is selling this seat.', NO_OPEN_SESSION: 'Open your cash drawer first.',
    MOBILE_REFERENCE_USED: 'This Zaad/eDahab transaction was already used.', PAYER_PHONE_REQUIRED: 'Enter the phone the money was sent from.',
    PAYMENT_REQUIRED: 'Collect the payment first.', INVALID_PIN: 'Wrong PIN.', UNKNOWN: 'Something went wrong.', pageNotFound: 'Page not found.', tryAgain: 'Try again. If it continues, contact your manager.',
  },
};

export default en;
