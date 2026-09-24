import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { importApi, userApi } from '@/api/services';
import { ApiRequestError, downloadFile } from '@/api/client';
import { Button, Card, EmptyState, ErrorState, Field, SectionTitle, Select, TableSkeleton } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/utils/format';
import type { AssignableUser, ImportJob, ImportPreview } from '@/types';

const FIELD_LABELS: Record<string, string> = {
  companyName: 'Company name',
  contactName: 'Contact name',
  designation: 'Designation',
  phone: 'Phone',
  alternatePhone: 'Alternate phone',
  email: 'Email',
  alternateEmail: 'Alternate email',
  website: 'Website',
  country: 'Country',
  state: 'State',
  city: 'City',
  industry: 'Industry',
  companySize: 'Company size',
  serviceRequired: 'Service required',
  leadSource: 'Lead source',
  priority: 'Priority',
  tags: 'Tags',
  remarks: 'Remarks',
};

export default function ImportsPage() {
  const toast = useToast();
  const { isAdmin, user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicateStrategy, setDuplicateStrategy] = useState<'SKIP' | 'IMPORT'>('SKIP');
  const [assignedBdeId, setAssignedBdeId] = useState('');
  const [bdes, setBdes] = useState<AssignableUser[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const result = await importApi.jobs();
      setJobs(result.data);
    } catch (err) {
      setJobsError(err instanceof ApiRequestError ? err.message : 'Could not load import history.');
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    if (isAdmin) void userApi.assignable().then((r) => setBdes(r.data)).catch(() => undefined);
  }, [isAdmin, loadJobs]);

  async function runPreview(selected: File, nextMapping?: Record<string, string>) {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const result = await importApi.preview(selected, nextMapping);
      setPreview(result.data);
      setMapping(nextMapping ?? result.data.mapping);
    } catch (err) {
      setPreview(null);
      setPreviewError(err instanceof ApiRequestError ? err.message : 'Could not read this file.');
    } finally {
      setPreviewing(false);
    }
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setPreview(null);
    if (selected) void runPreview(selected);
  }

  function changeMapping(field: string, header: string) {
    const next = { ...mapping };
    if (header) next[field] = header;
    else delete next[field];
    setMapping(next);
    if (file) void runPreview(file, next);
  }

  async function confirmImport() {
    if (!file) return;
    setImporting(true);
    try {
      const result = await importApi.confirm(file, mapping, duplicateStrategy, isAdmin && assignedBdeId ? Number(assignedBdeId) : null);
      toast.success(`Imported ${result.data.importedRows} of ${result.data.totalRows} rows`);
      setFile(null);
      setPreview(null);
      if (fileInput.current) fileInput.current.value = '';
      await loadJobs();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'The import could not be completed.');
    } finally {
      setImporting(false);
    }
  }

  async function downloadErrors(job: ImportJob) {
    try {
      await downloadFile(`/leads/import/${job.id}/errors.csv`, `import-${job.id}-errors.csv`);
    } catch {
      toast.error('Could not download the error report.');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Import leads</h1>
        <p className="text-sm text-slate-500">Upload an Excel or CSV file, review the preview, then import.</p>
        {!isAdmin && (
          <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
            Leads imported from your BDE account are automatically assigned to you and are visible only to you and admins.
          </div>
        )}
      </div>

      <Card>
        <SectionTitle title="1. Choose a file" />
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={onFileChange}
            className="block w-full max-w-md text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
          />
          {previewing && <span className="text-sm text-slate-500">Reading the file…</span>}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Accepted formats: .csv, .xls, .xlsx. Only the company name is mandatory; everything else is optional.
        </p>
        {previewError && <p className="mt-2 text-sm text-red-600">{previewError}</p>}
      </Card>

      {preview && (
        <>
          <Card>
            <SectionTitle title="2. Match your columns" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {preview.importableFields.map((field) => (
                <Field key={field} label={FIELD_LABELS[field] ?? field} required={field === 'companyName'}>
                  <Select value={mapping[field] ?? ''} onChange={(event) => changeMapping(field, event.target.value)}>
                    <option value="">Not imported</option>
                    {preview.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle title="3. Review the preview" />
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <span className="text-slate-700">{preview.summary.totalRows} rows</span>
              <span className="text-emerald-700">{preview.summary.validRows} ready</span>
              <span className="text-amber-700">{preview.summary.duplicateRows} duplicates</span>
              <span className="text-red-700">{preview.summary.invalidRows} with problems</span>
            </div>
            <div className="max-h-80 overflow-auto rounded border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">Row</th>
                    <th className="px-2 py-1.5">Company</th>
                    <th className="px-2 py-1.5">Contact</th>
                    <th className="px-2 py-1.5">Email / phone</th>
                    <th className="px-2 py-1.5">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} className={row.state === 'INVALID' ? 'bg-red-50' : row.state === 'DUPLICATE' ? 'bg-amber-50' : ''}>
                      <td className="px-2 py-1.5 text-slate-500">{row.rowNumber}</td>
                      <td className="px-2 py-1.5 text-slate-800">{row.data.companyName ?? '—'}</td>
                      <td className="px-2 py-1.5 text-slate-600">{row.data.contactName ?? '—'}</td>
                      <td className="px-2 py-1.5 text-slate-600">{row.data.email ?? row.data.phone ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        {row.state === 'VALID' && <span className="text-emerald-700">Ready</span>}
                        {row.state === 'DUPLICATE' && <span className="text-amber-700">{row.reason ?? 'Duplicate'}</span>}
                        {row.state === 'INVALID' && <span className="text-red-700">{row.errors.join('; ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle title="4. Import" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Duplicate rows">
                <Select value={duplicateStrategy} onChange={(event) => setDuplicateStrategy(event.target.value as 'SKIP' | 'IMPORT')}>
                  <option value="SKIP">Skip duplicates (recommended)</option>
                  <option value="IMPORT">Import them anyway</option>
                </Select>
              </Field>
              {isAdmin ? (
                <Field label="Assign every imported lead to">
                  <Select value={assignedBdeId} onChange={(event) => setAssignedBdeId(event.target.value)}>
                    <option value="">Leave unassigned</option>
                    {bdes.map((bde) => (
                      <option key={bde.id} value={bde.id}>
                        {bde.fullName}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{user?.fullName} (you)</p>
                  <p className="mt-1 text-xs text-slate-500">Assignment is locked to your account for imported leads.</p>
                </div>
              )}
            </div>
            <Button className="mt-3" onClick={confirmImport} loading={importing} disabled={preview.summary.validRows === 0 && duplicateStrategy === 'SKIP'}>
              <Upload className="h-4 w-4" /> Import leads
            </Button>
          </Card>
        </>
      )}

      <Card className="p-0">
        <div className="px-4 pt-4">
          <SectionTitle title="Import history" />
        </div>
        {jobsLoading ? (
          <div className="p-4">
            <TableSkeleton rows={4} columns={6} />
          </div>
        ) : jobsError ? (
          <ErrorState message={jobsError} onRetry={loadJobs} />
        ) : jobs.length === 0 ? (
          <EmptyState title="No imports yet" description="Your uploads will be listed here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">File</th>
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5">Imported by</th>
                  <th className="px-4 py-2.5">Rows</th>
                  <th className="px-4 py-2.5">Imported</th>
                  <th className="px-4 py-2.5">Skipped</th>
                  <th className="px-4 py-2.5 text-right">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2 text-slate-800">
                        <FileSpreadsheet className="h-4 w-4 text-slate-400" />
                        {job.fileName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDateTime(job.createdAt)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{job.creator ? `${job.creator.firstName} ${job.creator.lastName}` : '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{job.totalRows}</td>
                    <td className="px-4 py-2.5 text-emerald-700">{job.importedRows}</td>
                    <td className="px-4 py-2.5 text-amber-700">{job.skippedRows}</td>
                    <td className="px-4 py-2.5 text-right">
                      {job.invalidRows > 0 ? (
                        <Button small variant="secondary" onClick={() => void downloadErrors(job)}>
                          <Download className="h-4 w-4" /> {job.invalidRows}
                        </Button>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
