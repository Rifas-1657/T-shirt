// Cross-store actions. Every way of opening a product (3D rail click, keyboard index, deep link)
// goes through openProduct so the design state always belongs to the product being shown.
import { emptyDesign } from '@/lib/designSchema';
import type { PublicProduct, SavedDesign } from '@/lib/types';
import { useDesign } from './designStore';
import { useShowroom } from './showroomStore';

export function openProduct(p: PublicProduct, restore?: SavedDesign) {
  useDesign.getState().load(restore ?? emptyDesign(p));
  // the garment leaves its own rack, so frame that rack (matters for deep links and the overview)
  useShowroom.setState({ rack: p.garment, selectedGarment: p.garment });
  useShowroom.getState().open(p.id);
}
