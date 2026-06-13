BEGIN TRANSACTION;

-- Phase 1: Clean fragmentary rows
DELETE FROM stichera WHERE commemoration_id=1196 AND "order" IN (90,91);

-- Phase 2: Move Elisha-themed stichera to 1197 (Prophet Elisha)
UPDATE stichera SET commemoration_id=1197, label='the holy prophet'
  WHERE commemoration_id=1196 AND "order" IN (0,1,2);
UPDATE stichera SET commemoration_id=1197, "order"=3, label='the holy prophet'
  WHERE commemoration_id=1196 AND "order"=6;

-- Phase 3: Move Methodius-themed stichera to 1198
UPDATE stichera SET commemoration_id=1198, "order"=1, label='the holy hierarch'
  WHERE commemoration_id=1196 AND "order"=3;
UPDATE stichera SET commemoration_id=1198, "order"=2, label='the holy hierarch'
  WHERE commemoration_id=1196 AND "order"=4;
UPDATE stichera SET commemoration_id=1198, "order"=3, label='the holy hierarch'
  WHERE commemoration_id=1196 AND "order"=5;

COMMIT;
