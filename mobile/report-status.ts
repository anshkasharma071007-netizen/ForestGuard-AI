import type { ReportStatus } from '@/services/api';

export const reportStatuses = {
  pending: { label: 'Pending', tone: 'warning', group: 'pending' },
  forwarded: { label: 'Pending', tone: 'warning', group: 'pending' },
  verified: { label: 'Under Work', tone: 'info', group: 'under_work' },
  under_work: { label: 'Under Work', tone: 'info', group: 'under_work' },
  resolved: { label: 'Resolved', tone: 'success', group: 'resolved' },
  rejected: { label: 'Rejected', tone: 'danger', group: 'rejected' },
  closed: { label: 'Resolved', tone: 'success', group: 'resolved' },
} as const satisfies Record<ReportStatus, { label: string; tone: string; group: string }>;

export type ReportGroup = typeof reportStatuses[ReportStatus]['group'];
export const reportFilters = [
  { id: 'all', label: 'All statuses' },
  { id: 'pending', label: reportStatuses.pending.label },
  { id: 'under_work', label: reportStatuses.under_work.label },
  { id: 'rejected', label: reportStatuses.rejected.label },
  { id: 'resolved', label: reportStatuses.resolved.label },
] as const;
