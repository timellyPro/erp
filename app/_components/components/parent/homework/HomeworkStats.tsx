'use client';

import {
  ListChecks,
  Clock,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';

interface HomeworkStatsProps {
  total: number;
  pending: number;
  submitted: number;
  completion: number;
}

export default function HomeworkStats({
  total,
  pending,
  submitted,
  completion,
}: HomeworkStatsProps) {
  return (
    <>
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="somu rounded-2xl statCard">
          <ListChecks className="icon text-lime-400" />
          <div className="statValue">{total}</div>
          <p className="statLabel">All assignments</p>
        </div>

        <div className="somu rounded-2xl statCard">
          <Clock className="icon text-orange-400" />
          <div className="statValue">{pending}</div>
          <p className="statLabel">Need attention</p>
        </div>

        <div className="somu rounded-2xl statCard">
          <CheckCircle2 className="icon text-lime-400" />
          <div className="statValue">{submitted}</div>
          <p className="statLabel">On time</p>
        </div>

        <div className="somu rounded-2xl statCard">
          <TrendingUp className="icon text-yellow-300" />
          <div className="statValue">{completion}%</div>
          <p className="statLabel">Overall progress</p>
        </div>
      </section>

      <style jsx>{`
        .statCard {
          padding: 24px;
        }

        .icon {
          height: 24px;
          width: 24px;
        }

        .statValue {
          margin-top: 16px;
          font-size: 28px;
          font-weight: 700;
        }

        .statLabel {
          margin-top: 4px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.7);
        }
      `}</style>
    </>
  );
}
