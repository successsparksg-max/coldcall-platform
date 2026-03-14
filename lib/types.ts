import type { InferSelectModel } from "drizzle-orm";
import type {
  users,
  agentCredentials,
  agentBilling,
  callLists,
  callEntries,
  calls,
  uploadValidations,
} from "./schema";

// DB row types
export type User = InferSelectModel<typeof users>;
export type AgentCredential = InferSelectModel<typeof agentCredentials>;
export type AgentBillingRecord = InferSelectModel<typeof agentBilling>;
export type CallList = InferSelectModel<typeof callLists>;
export type CallEntry = InferSelectModel<typeof callEntries>;
export type Call = InferSelectModel<typeof calls>;
export type UploadValidation = InferSelectModel<typeof uploadValidations>;

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface UploadResult {
  success: boolean;
  callListId?: string;
  totalEntries?: number;
  warnings?: { type: string; message: string }[];
  errors?: {
    file: string | null;
    headers: string | null;
    rows: ValidationError[];
  };
  summary?: { totalRows: number; validRows: number; errorRows: number };
}

export interface AgentStats {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  isPaid: boolean;
  totalLists: number;
  totalCalls: number;
  callsAnswered: number;
  avgRating: number | null;
  appointmentsBooked: number;
  lastActive: string | null;
  credentialsConfigured: boolean;
}

export interface CallEntryWithAnalysis extends CallEntry {
  analysis?: {
    rating: number | null;
    summary: string | null;
    email: string | null;
    name: string | null;
    bookingStatus: string | null;
    bookingLocation: string | null;
    bookingDate: string | null;
    bookingTime: string | null;
    estimatedCost: string | null;
    transcript: string | null;
    recordingUrl: string | null;
    duration: number | null;
    callCost: string | null;
  } | null;
}
