const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export const isApiConfigured = API_URL.length > 0;

export type ReportSubmissionResponse = {
  reference_code: string;
  status: 'pending' | 'forwarded' | 'closed';
  message: string;
};

export type ReportStatusResponse = ReportSubmissionResponse;

export async function submitCommunityReport(formData: FormData): Promise<ReportSubmissionResponse> {
  if (!isApiConfigured) {
    throw new Error('Live reporting is not connected in demonstration mode. Your report was not sent.');
  }

  const response = await fetch(`${API_URL}/api/community/reports`, { method: 'POST', body: formData });
  if (!response.ok) {
    throw new Error('The report could not be submitted. Please try again.');
  }

  return parseReportResponse(await response.json());
}

export async function getReportStatus(referenceCode: string): Promise<ReportStatusResponse> {
  if (!isApiConfigured) {
    throw new Error('Status lookup is unavailable in demonstration mode.');
  }

  const response = await fetch(`${API_URL}/api/community/reports/${encodeURIComponent(referenceCode)}`);
  if (!response.ok) {
    throw new Error('That report could not be found.');
  }

  return parseReportResponse(await response.json());
}

function parseReportResponse(value: unknown): ReportSubmissionResponse {
  if (!value || typeof value !== 'object') throw new Error('The Forest Guard service returned an invalid response.');
  const record = value as Record<string, unknown>;
  if (typeof record.reference_code !== 'string' || typeof record.message !== 'string' || !isReportStatus(record.status)) {
    throw new Error('The Forest Guard service returned an invalid response.');
  }
  return { reference_code: record.reference_code, status: record.status, message: record.message };
}

function isReportStatus(value: unknown): value is ReportSubmissionResponse['status'] {
  return value === 'pending' || value === 'forwarded' || value === 'closed';
}
