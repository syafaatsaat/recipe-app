-- Minimal global seed for local dev and tests. The full ~150-item catalog comes later.
-- Densities = grams per volume from King Arthur's ingredient weight chart
-- (https://www.kingarthurbaking.com/learn/ingredient-weight-chart, checked 2026-11-25),
-- divided by the volume in ml (1 cup = 236.588, 1 tbsp = 14.787, 1 tsp = 4.929).
-- Exception: liquids. The chart uses the 8 oz = 1 cup convention (227 g/cup), which
-- understates water (1.000 g/ml by definition) and milk (~1.03), so physical values are used.

insert into ingredients (owner_id, name, aliases, density_g_per_ml, each_g, default_scaling_rule, prefer_mass_in_metric, shopping_category) values
  (null, 'all-purpose flour', '{ap flour,plain flour,flour}',          0.5072, null, 'linear',      true,  'baking'), -- 120 g/cup
  (null, 'granulated sugar',  '{sugar,white sugar,caster sugar}',      0.8369, null, 'linear',      true,  'baking'), -- 198 g/cup
  (null, 'brown sugar',       '{light brown sugar,dark brown sugar}',  0.9003, null, 'linear',      true,  'baking'), -- 213 g/cup packed
  (null, 'unsalted butter',   '{butter}',                              0.9552, null, 'linear',      true,  'dairy'), -- 113 g/½ cup
  (null, 'milk',              '{whole milk}',                          1.0310, null, 'linear',      false, 'dairy'),
  (null, 'water',             '{}',                                    1.0000, null, 'linear',      false, null),
  (null, 'egg',               '{eggs,large egg,large eggs}',           null,   50,   'count_round', true,  'dairy'), -- 50 g/large egg
  -- salts differ up to 2× by volume, so generic 'salt' has no density (volume stays volume)
  (null, 'salt',              '{}',                                    null,   null, 'linear',      true,  'pantry'),
  (null, 'table salt',        '{fine salt}',                           1.2173, null, 'linear',      true,  'pantry'), -- 18 g/tbsp
  (null, 'kosher salt (Morton)',          '{morton kosher salt}',      1.0820, null, 'linear',      true,  'pantry'), -- 16 g/tbsp
  (null, 'kosher salt (Diamond Crystal)', '{diamond crystal kosher salt,diamond crystal}', 0.5410, null, 'linear', true, 'pantry'), -- 8 g/tbsp
  (null, 'baking powder',     '{}',                                    0.8115, null, 'leavening',   true,  'baking'), -- 4 g/tsp
  (null, 'baking soda',       '{bicarbonate of soda,bicarb}',          1.2173, null, 'leavening',   true,  'baking'), -- 3 g/½ tsp
  (null, 'cocoa powder',      '{unsweetened cocoa,cocoa}',             0.3550, null, 'linear',      true,  'baking'), -- 42 g/½ cup
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
