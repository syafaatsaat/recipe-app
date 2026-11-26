// Hand-written test pages (not copied from any site).

export const JSONLD_GRAPH = `<!doctype html><html><head>
<meta property="og:site_name" content="Example Kitchen">
<link rel="canonical" href="https://example.com/lemon-olive-oil-cake">
<script type="application/ld+json">{ "broken": </script>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebSite","name":"Example Kitchen"},
  {"@type":["Recipe","NewsArticle"],"name":"Lemon olive oil cake",
   "description":"A plain &amp; <b>sunny</b> cake.",
   "image":[{"@type":"ImageObject","url":"https://example.com/cake.jpg"}],
   "recipeYield":["8","8 slices"],
   "prepTime":"PT15M","cookTime":"PT45M",
   "recipeIngredient":["1¾ cups (210g) all-purpose flour","1 cup granulated sugar","3 large eggs, room temperature",
     "¾ cup extra-virgin olive oil","1 stick butter, softened","Zest of 2 lemons","Pinch of flaky salt"],
   "recipeInstructions":[
     {"@type":"HowToSection","name":"Batter","itemListElement":[
       {"@type":"HowToStep","text":"Heat the oven to 350°F. Oil a 9-inch round pan."},
       {"@type":"HowToStep","text":"Whisk the sugar, eggs and zest until pale."}]},
     {"@type":"HowToStep","name":"Fold in the flour, then the oil and butter."},
     "Bake 45 minutes, until a skewer comes out clean."]}
]}
</script></head><body><h1>Lemon olive oil cake</h1></body></html>`;

export const JSONLD_SIMPLE = `<html><head>
<script type="application/ld+json">
[{"@context":"https://schema.org","@type":"Recipe","name":"Weeknight dal","recipeYield":4,
  "image":"https://example.org/dal.jpg","totalTime":"PT40M",
  "recipeIngredient":["1 cup red lentils","For the tadka:","2 tbsp ghee","1 tsp cumin seeds","salt to taste"],
  "recipeInstructions":"Rinse the lentils.\\nSimmer with 3 cups water for 20 minutes.\\nFry the cumin in ghee and pour over."}]
</script></head><body></body></html>`;

export const MICRODATA = `<html><head><title>Shortbread</title></head><body>
<div itemscope itemtype="https://schema.org/Recipe">
  <h1 itemprop="name">Brown butter shortbread</h1>
  <meta itemprop="prepTime" content="PT20M">
  <time itemprop="cookTime" datetime="PT25M">25 min</time>
  <img itemprop="image" src="https://example.net/shortbread.jpg">
  <span itemprop="recipeYield">16 pieces</span>
  <ul>
    <li itemprop="recipeIngredient">1 cup (2 sticks) butter</li>
    <li itemprop="recipeIngredient">½ cup powdered sugar</li>
    <li itemprop="ingredients">2 cups flour</li>
  </ul>
  <ol itemprop="recipeInstructions">
    <li>Brown the butter and cool it.</li>
    <li>Mix everything and bake at 160 °C for 25 minutes.</li>
  </ol>
</div></body></html>`;

export const NO_RECIPE = `<html><head><title>About us</title>
<script type="application/ld+json">{"@type":"Organization","name":"Example"}</script>
</head><body><p>We love cake.</p></body></html>`;

export const PASTE_WITH_HEADINGS = `Lemon drizzle loaf
Serves 8

Ingredients
225g self-raising flour
225g caster sugar
4 eggs
For the drizzle:
juice of 1½ lemons
85g caster sugar

Method
1. Heat the oven to 180°C.
2. Beat everything together and spoon into a 9x5 loaf tin.
Step 3: Bake for 45 minutes.
For the drizzle:
4) Mix the juice and sugar, and pour over the warm cake.`;

export const PASTE_NO_HEADINGS = `Quick pancakes
1 cup flour
1 tbsp sugar
1 cup milk
1 egg
Whisk everything until smooth, with a few lumps left.
Cook on a hot buttered pan until bubbles appear, then flip.`;

/** As copied from a recipe card on a blog: each label on its own line, its value below. */
export const PASTE_BLOG_CARD = `Lemon olive oil cake
Prep Time
15 mins
Cook Time
1 hr 5 mins
Total Time
1 hr 20 mins
Servings
8 slices

Ingredients
1¾ cups all-purpose flour
3 large eggs

Instructions
Heat the oven to 350°F.
Bake 45 minutes, until golden.`;
