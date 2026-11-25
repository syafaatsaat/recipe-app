-- Minimal global seed for local dev and tests. The full ~150-item catalog comes later.
-- Densities are approximate (g per US cup / 236.588 ml) and are rechecked against
-- a published weight chart in M1 before being relied on.

insert into ingredients (owner_id, name, aliases, density_g_per_ml, each_g, default_scaling_rule, prefer_mass_in_metric, shopping_category) values
  (null, 'all-purpose flour', '{ap flour,plain flour,flour}',          0.5072, null, 'linear',      true,  'baking'),
  (null, 'granulated sugar',  '{sugar,white sugar,caster sugar}',      0.8454, null, 'linear',      true,  'baking'),
  (null, 'brown sugar',       '{light brown sugar,dark brown sugar}',  0.9003, null, 'linear',      true,  'baking'),
  (null, 'unsalted butter',   '{butter}',                              0.9590, null, 'linear',      true,  'dairy'),
  (null, 'milk',              '{whole milk}',                          1.0310, null, 'linear',      false, 'dairy'),
  (null, 'water',             '{}',                                    1.0000, null, 'linear',      false, null),
  (null, 'egg',               '{eggs,large egg,large eggs}',           null,   50,   'count_round', true,  'dairy'),
  (null, 'salt',              '{kosher salt,table salt,fine salt}',    null,   null, 'linear',      true,  'pantry'),
  (null, 'baking powder',     '{}',                                    0.8115, null, 'leavening',   true,  'baking'),
  (null, 'baking soda',       '{bicarbonate of soda,bicarb}',          1.2173, null, 'leavening',   true,  'baking'),
  (null, 'cocoa powder',      '{unsweetened cocoa,cocoa}',             0.3551, null, 'linear',      true,  'baking'),
  (null, 'bay leaf',          '{bay leaves}',                          null,   null, 'fixed',       true,  'spices');

-- Pan presets. Dimensions in cm (1 in = 2.54 cm).
insert into pans (owner_id, label, shape, diameter_cm, width_cm, length_cm, depth_cm, volume_ml, cup_count) values
  (null, '8 in round',             'round',     20.32, null,  null,  5.08, null,   null),
  (null, '9 in round',             'round',     22.86, null,  null,  5.08, null,   null),
  (null, '8×8 in square',          'square',    null,  20.32, 20.32, 5.08, null,   null),
  (null, '9×13 in rectangle',      'rectangle', null,  22.86, 33.02, 5.08, null,   null),
  (null, '9×5 in loaf',            'loaf',      null,  12.70, 22.86, 7.62, null,   null),
  (null, 'Half sheet (18×13 in)',  'sheet',     null,  33.02, 45.72, 2.54, null,   null),
  (null, '10-cup bundt',           'bundt',     null,  null,  null,  null, 2366.0, null),
  (null, '12-cup muffin tin',      'muffin',    null,  null,  null,  null, null,   12);
