"use client";

import { JobItem } from "@/lib/api/research";

interface Props {
  jobPostings: JobItem[];
}

function JobCard({ job }: { job: JobItem }) {
  return (
    <a
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
            {job.title}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-600">{job.company}</span>
            {job.location && <span>· {job.location}</span>}
            {job.description && <span>· {job.description}</span>}
          </div>
          {job.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {job.skills.slice(0, 5).map((s, j) => (
                <span key={j} className="text-2xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md font-medium">
                  {s}
                </span>
              ))}
              {job.skills.length > 5 && (
                <span className="text-2xs text-slate-400">+{job.skills.length - 5}</span>
              )}
            </div>
          )}
        </div>
        <span className="text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0 text-sm mt-0.5">↗</span>
      </div>
    </a>
  );
}

export function JobPostingList({ jobPostings }: Props) {
  if (jobPostings.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
        채용 공고 {jobPostings.length}건
      </div>
      <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
        {jobPostings.map((job, i) => <JobCard key={i} job={job} />)}
      </div>
    </div>
  );
}
