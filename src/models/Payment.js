import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  plan: {
    type: String,
    default: 'monthly',
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'quarterly', 'annual'],
    default: 'monthly',
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    enum: ['EGP', 'SAR', 'USD'],
    default: 'EGP',
  },
  method: {
    type: String,
    enum: ['vodafone_cash', 'instapay'],
    required: true,
  },
  // Sender details
  senderPhone: {
    type: String,
    trim: true,
  },
  senderName: {
    type: String,
    trim: true,
  },
  referenceNumber: {
    type: String,
    trim: true,
  },
  // Proof of payment
  receiptUrl: {
    type: String,
    required: true,
  },
  // Review Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  rejectionReason: {
    type: String,
    trim: true,
  },
  activationDurationDays: {
    type: Number,
    default: 30,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewedAt: {
    type: Date,
  },
  notes: {
    type: String,
    trim: true,
  },
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
