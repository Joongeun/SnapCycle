import type { ItemCategory, ItemCondition, ItemIdentification } from '@/types/item';

const VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY ?? '';
const VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`;

interface VisionLabel {
  description: string;
  score: number;
}

interface VisionResponse {
  responses: {
    labelAnnotations?: VisionLabel[];
    localizedObjectAnnotations?: { name: string; score: number }[];
    error?: { message: string };
  }[];
}

/** Map a free-form Google Vision label to one of our item categories. */
function categorize(labels: string[]): ItemCategory {
  const joined = labels.join(' ').toLowerCase();
  const rules: [ItemCategory, string[]][] = [
    ['furniture', ['chair', 'table', 'couch', 'sofa', 'desk', 'furniture', 'cabinet', 'dresser', 'bed', 'shelf', 'stool', 'bench']],
    ['appliance', ['refrigerator', 'fridge', 'microwave', 'washer', 'dryer', 'oven', 'appliance', 'dishwasher', 'blender', 'toaster']],
    ['electronics', ['television', 'tv', 'monitor', 'laptop', 'computer', 'phone', 'speaker', 'camera', 'electronic', 'console']],
    ['clothing', ['shirt', 'jacket', 'dress', 'clothing', 'shoe', 'coat', 'pants', 'apparel']],
    ['decor', ['lamp', 'rug', 'mirror', 'vase', 'painting', 'decor', 'curtain', 'pillow', 'frame']],
    ['sports', ['bicycle', 'bike', 'treadmill', 'sports', 'ball', 'weights', 'gym']],
  ];

  for (const [category, keywords] of rules) {
    if (keywords.some((k) => joined.includes(k))) return category;
  }
  return 'other';
}

/**
 * Identify an item from a base64 JPEG using Google Cloud Vision
 * (label + object localization). Returns our normalized identification shape.
 */
export async function identifyWithVision(base64: string): Promise<ItemIdentification> {
  if (!VISION_API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_GOOGLE_VISION_API_KEY');
  }

  const body = {
    requests: [
      {
        image: { content: base64 },
        features: [
          { type: 'LABEL_DETECTION', maxResults: 10 },
          { type: 'OBJECT_LOCALIZATION', maxResults: 5 },
        ],
      },
    ],
  };

  const response = await fetch(VISION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Vision API error: HTTP ${response.status}`);
  }

  const data: VisionResponse = await response.json();
  const result = data.responses?.[0];

  if (result?.error) {
    throw new Error(result.error.message);
  }

  const NOISE = ['cable', 'wire', 'cord', 'plug', 'electrical wiring', 'power cord'];

  const rawObjects = result?.localizedObjectAnnotations ?? [];
  const filteredObjects = rawObjects
    .sort((a, b) => b.score - a.score)
    .filter((o) => !NOISE.some((n) => o.name.toLowerCase().includes(n)));

  const objects = filteredObjects.map((o) => o.name);
  const labels = (result?.labelAnnotations ?? [])
    .filter((l) => !NOISE.some((n) => l.description.toLowerCase().includes(n)))
    .map((l) => l.description);
  const allTerms = [...objects, ...labels];

  if (allTerms.length === 0) {
    throw new Error('Could not identify the item. Try another photo.');
  }

  const itemName = objects[0] ?? labels[0];
  const category = categorize(allTerms);

  return {
    itemName,
    category,
    condition: 'good' as ItemCondition, // Vision can't assess condition; default, user can refine
    description: labels.slice(0, 5).join(', '),
  };
}
