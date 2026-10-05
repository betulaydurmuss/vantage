// Scan history and the watchlist, kept in memory and persisted to one JSON file.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_REPORTS = 500;

export class Store {
  /** @param {string|null} file JSON file to persist to; null keeps everything in memory. */
  constructor(file = null) {
    this.file = file;
    this.reports = []; // newest first
    this.watch = [];
    this.saving = Promise.resolve();
  }

  async load() {
    if (!this.file) return this;
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      this.reports = Array.isArray(data.reports) ? data.reports : [];
      this.watch = Array.isArray(data.watch) ? data.watch : [];
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`cannot read ${this.file}: ${err.message}`, { cause: err });
    }
    return this;
  }

  /** Writes are serialized and atomic: a temp file is renamed over the old one. */
  save() {
    if (!this.file) return Promise.resolve();
    const snapshot = JSON.stringify({ reports: this.reports, watch: this.watch });
    this.saving = this.saving
      .catch(() => {})
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${process.pid}.tmp`;
        await writeFile(tmp, snapshot);
        await rename(tmp, this.file);
      });
    return this.saving;
  }

  addReport(report) {
    this.reports.unshift(report);
    if (this.reports.length > MAX_REPORTS) this.reports.length = MAX_REPORTS;
    return this.save();
  }

  getReport(id) {
    return this.reports.find((r) => r.id === id) ?? null;
  }

  deleteReport(id) {
    const before = this.reports.length;
    this.reports = this.reports.filter((r) => r.id !== id);
    if (this.reports.length === before) return false;
    this.save();
    return true;
  }

  /** Report summaries without findings, optionally for one target. */
  summaries(target) {
    return this.reports.filter((r) => !target || r.target === target).map(summary);
  }

  /** Grades of one target over time, oldest first. */
  trend(target, limit = 20) {
    return this.reports
      .filter((r) => r.target === target)
      .slice(0, limit)
      .reverse()
      .map((r) => ({ id: r.id, grade: r.grade, score: r.score, at: r.startedAt }));
  }

  addWatch(target) {
    const existing = this.watch.find((w) => w.target === target);
    if (existing) return existing;
    const entry = { id: randomUUID(), target, addedAt: new Date().toISOString(), lastScan: null, lastError: null };
    this.watch.push(entry);
    this.save();
    return entry;
  }

  removeWatch(id) {
    const before = this.watch.length;
    this.watch = this.watch.filter((w) => w.id !== id);
    if (this.watch.length === before) return false;
    this.save();
    return true;
  }

  /** Watch entries joined with their latest grade, the one before and the trend. */
  watchStatus() {
    return this.watch.map((w) => {
      const [latest, previous] = this.reports.filter((r) => r.target === w.target);
      return {
        ...w,
        latest: latest ? summary(latest) : null,
        previous: previous ? summary(previous) : null,
        trend: this.trend(w.target),
      };
    });
  }
}

export function summary(r) {
  return {
    id: r.id,
    target: r.target,
    finalUrl: r.finalUrl,
    statusCode: r.statusCode,
    startedAt: r.startedAt,
    durationMs: r.durationMs,
    score: r.score,
    grade: r.grade,
    counts: r.counts,
  };
}
