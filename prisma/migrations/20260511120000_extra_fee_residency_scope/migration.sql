-- Extra fees can be limited to hostellers / day scholars (default ALL = everyone).
ALTER TABLE "ExtraFee" ADD COLUMN "residencyScope" TEXT NOT NULL DEFAULT 'ALL';
