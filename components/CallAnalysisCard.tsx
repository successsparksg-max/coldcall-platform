import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Mail, User, Calendar, Clock, DollarSign, MapPin } from "lucide-react";

interface AnalysisData {
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
}

export function CallAnalysisCard({ analysis }: { analysis: AnalysisData }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Call Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Rating */}
        {analysis.rating && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Rating:</span>
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-4 w-4 ${
                    star <= analysis.rating!
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Booking Status */}
        {analysis.bookingStatus && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <Badge
                variant={
                  analysis.bookingStatus === "TRUE" ? "default" : "secondary"
                }
                className={
                  analysis.bookingStatus === "TRUE"
                    ? "bg-green-100 text-green-700"
                    : ""
                }
              >
                {analysis.bookingStatus === "TRUE" ? "Booked" : "Not Booked"}
              </Badge>
            </div>
            {analysis.bookingStatus === "TRUE" &&
              (analysis.bookingLocation ||
                analysis.bookingDate ||
                analysis.bookingTime) && (
                <div className="ml-6 space-y-0.5 text-gray-600">
                  {analysis.bookingLocation && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      <span>{analysis.bookingLocation}</span>
                    </div>
                  )}
                  {(analysis.bookingDate || analysis.bookingTime) && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      <span>
                        {[analysis.bookingDate, analysis.bookingTime]
                          .filter(Boolean)
                          .join(" at ")}
                      </span>
                    </div>
                  )}
                </div>
              )}
          </div>
        )}

        {/* Summary */}
        {analysis.summary && (
          <div>
            <span className="text-gray-500">Summary:</span>
            <p className="mt-1 text-gray-700">{analysis.summary}</p>
          </div>
        )}

        {/* Extracted info */}
        {analysis.name && (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-gray-400" />
            <span>{analysis.name}</span>
          </div>
        )}
        {analysis.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-400" />
            <span>{analysis.email}</span>
          </div>
        )}

        {/* Duration & Cost */}
        <div className="flex gap-4">
          {analysis.duration != null && (
            <div className="flex items-center gap-1 text-gray-500">
              <Clock className="h-3 w-3" />
              <span>{Math.floor(analysis.duration / 60)}m {analysis.duration % 60}s</span>
            </div>
          )}
          {analysis.callCost && (
            <div className="flex items-center gap-1 text-gray-500">
              <DollarSign className="h-3 w-3" />
              <span>${analysis.callCost}</span>
            </div>
          )}
        </div>

        {/* Transcript toggle */}
        {analysis.transcript && (
          <details className="mt-2">
            <summary className="cursor-pointer text-blue-600 text-xs">
              View Transcript
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">
              {analysis.transcript}
            </pre>
          </details>
        )}

        {analysis.recordingUrl && (
          <a
            href={analysis.recordingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            View Recording
          </a>
        )}
      </CardContent>
    </Card>
  );
}
