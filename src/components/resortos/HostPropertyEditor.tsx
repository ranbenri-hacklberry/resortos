import React, { useState, useEffect } from 'react';
import {
  Building2,
  Image as ImageIcon,
  BedDouble,
  Sparkles,
  Wifi,
  Save,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Camera,
  Users,
  Bath,
  Bed,
  Coffee,
  Flame,
  ShieldCheck,
  Eye,
  Sliders,
  Check,
  Layers,
  ArrowRight,
  Info,
  Tv,
  Wand2
} from 'lucide-react';
import { AIPhotoStudioModal } from '../media/AIPhotoStudioModal';

export interface ManagedUnit {
  id: string;
  name: string;
  type: 'cabin' | 'suite' | 'villa' | 'dome' | 'tent' | 'room';
  bedrooms: number;
  bathrooms: number;
  max_occupancy: number;
  base_price: number; // in ILS
  weekend_price: number; // in ILS
  size_m2?: number;
  features: string[];
  photos?: string[];
}

export interface ManagedProperty {
  id: string;
  slug: string;
  name: string;
  hebrew_name: string;
  tagline: string;
  description: string;
  village: string;
  region: string;
  address: string;
  whatsapp_number: string;
  phone: string;
  contact_name?: string;
  admin_notes?: string;
  email?: string;
  hero_image?: string | null;
  gallery_images: string[];
  amenities: string[];
  units: ManagedUnit[];
  wifi_ssid?: string;
  wifi_password?: string;
  host_welcome_notes?: string;
  host_avatar_url?: string;
  claimed_status: 'unclaimed_seeded' | 'claim_pending' | 'claimed_verified';
  direct_booking_enabled: boolean;
  // CRM Funnel & Visibility
  crm_status?: 'Lead_Identified' | 'Portal_Free_Active' | 'Upsell_Pitch_Sent' | 'Verified_Subscriber' | 'Opt_Out';
  is_public?: boolean;
  reference_image_urls?: string[];
  source?: string;
  source_url?: string;
  first_touch_sent_at?: string | null;
  last_outbound_at?: string | null;
  last_inbound_at?: string | null;
  opted_out_at?: string | null;
  property_public_path?: string | null;
  // Extra pricing & policies
  extra_child_fee?: number; // ₪ per child per night
  allows_pets?: boolean; // Are pets/dogs allowed?
  pet_fee?: number; // ₪ per pet or 0 if free
  cleaning_fee?: number; // ₪ cleaning fee per stay
  holiday_surcharge_percent?: number; // % surcharge on holidays/special dates
}

export interface HostPropertyEditorProps {
  properties: ManagedProperty[];
  activePropertyId: string;
  onSelectProperty: (propertyId: string) => void;
  onSaveProperty: (updatedProperty: ManagedProperty) => void;
  onPreviewPublicListing?: (propertyId: string) => void;
  onOpenRoomGuides?: (propertyId: string) => void;
  className?: string;
}

// Canonical Amenities by Category
const AMENITY_CATEGORIES = [
  {
    category: 'בריכות ומים',
    items: [
      'בריכה פרטית',
      'בריכה מחוממת ומקורה',
      'בריכת שחייה גדולה',
      'ג׳קוזי ספא ענק',
      'ג׳קוזי פנימי בסוויטה',
      'סאונה יבשה/רטובה'
    ]
  },
  {
    category: 'קולינריה ומטבח',
    items: [
      'מכונת אספרסו נספרסו',
      'מטבחון מאובזר וכלי אוכל',
      'מקרר ומיקרוגל',
      'עמדת מנגל BBQ פרטית',
      'טאבון פיצה מקצועי',
      'ארוחת בוקר כפרית בתיאום'
    ]
  },
  {
    category: 'נוף וטבע',
    items: [
      'נוף פנורמי לכנרת',
      'נוף פתוח להרי הגולן',
      'מדשאות ירוקות וצמחייה עשירה',
      'מרפסת דק פרטית מול השקיעה',
      'בוסתן עצי פרי ופינות ישיבה'
    ]
  },
  {
    category: 'טכנולוגיה, נוחות ודת',
    items: [
      'אינטרנט Wi-Fi מהיר',
      'טלוויזיה חכמה Smart TV',
      'מערכת שמע בלוטוס',
      'מתאים לדתיים / פלטה ומיחם',
      'נגישות לבעלי מוגבלויות',
      'חניה צמודה חינם'
    ]
  }
];

// Suggested High Quality Hospitality Unsplash Photos for Quick Insertion
const PRESET_PHOTOS = [
  { label: 'בריכה ונוף פנורמי', url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80' },
  { label: 'בקתת עץ יוקרתית', url: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80' },
  { label: 'ג׳קוזי ספא חיצוני', url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80' },
  { label: 'סוויטת בוטיק מעוצבת', url: 'https://images.unsplash.com/photo-1587061949409-02df41d5e562?auto=format&fit=crop&w=1200&q=80' },
  { label: 'מרפסת שקיעה ודק עץ', url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80' },
  { label: 'פינת קפה וארוחת בוקר', url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80' }
];

export const HostPropertyEditor: React.FC<HostPropertyEditorProps> = ({
  properties,
  activePropertyId,
  onSelectProperty,
  onSaveProperty,
  onPreviewPublicListing,
  onOpenRoomGuides,
  className = ''
}) => {
  const currentProp = properties.find((p) => p.id === activePropertyId) || properties[0];
  const [formData, setFormData] = useState<ManagedProperty>(currentProp);
  const [activeTab, setActiveTab] = useState<'info' | 'photos' | 'units' | 'amenities' | 'guides'>('info');
  const [isSaved, setIsSaved] = useState(false);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newCustomAmenity, setNewCustomAmenity] = useState('');
  const [selectedUnitIndex, setSelectedUnitIndex] = useState(0);
  const [studioModalOpen, setStudioModalOpen] = useState(false);
  const [studioTargetImage, setStudioTargetImage] = useState('');

  // Sync state when activePropertyId changes
  useEffect(() => {
    if (currentProp) {
      setFormData(currentProp);
      setSelectedUnitIndex(0);
      setIsSaved(false);
    }
  }, [activePropertyId, currentProp]);

  if (!formData) {
    return (
      <div className="p-8 text-center text-stone-500 bg-white rounded-3xl border border-stone-200">
        לא נבחר מתחם לעריכה.
      </div>
    );
  }

  // Handle Input Changes
  const handleChange = (field: keyof ManagedProperty, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsSaved(false);
  };

  // Handle Unit Field Changes
  const handleUnitChange = (index: number, field: keyof ManagedUnit, value: any) => {
    setFormData((prev) => {
      const updatedUnits = [...prev.units];
      updatedUnits[index] = { ...updatedUnits[index], [field]: value };
      return { ...prev, units: updatedUnits };
    });
    setIsSaved(false);
  };

  // Add New Unit
  const handleAddUnit = () => {
    const newUnitId = `${formData.slug}-unit-${formData.units.length + 1}`;
    const newUnit: ManagedUnit = {
      id: newUnitId,
      name: `יחידת אירוח ${formData.units.length + 1}`,
      type: 'cabin',
      bedrooms: 1,
      bathrooms: 1,
      max_occupancy: 4,
      base_price: 850,
      weekend_price: 1100,
      features: ['ג׳קוזי ספא', 'מרפסת פרטית']
    };
    setFormData((prev) => ({
      ...prev,
      units: [...prev.units, newUnit]
    }));
    setSelectedUnitIndex(formData.units.length);
    setIsSaved(false);
  };

  // Delete Unit
  const handleDeleteUnit = (indexToDelete: number) => {
    if (formData.units.length <= 1) {
      alert('חובה להשאיר לפחות יחידת אירוח אחת במתחם.');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      units: prev.units.filter((_, idx) => idx !== indexToDelete)
    }));
    setSelectedUnitIndex(Math.max(0, indexToDelete - 1));
    setIsSaved(false);
  };

  // Add Gallery Photo
  const handleAddPhoto = (urlToAdd: string) => {
    if (!urlToAdd.trim()) return;
    setFormData((prev) => ({
      ...prev,
      gallery_images: [...prev.gallery_images, urlToAdd.trim()]
    }));
    setNewPhotoUrl('');
    setIsSaved(false);
  };

  // Remove Gallery Photo
  const handleRemovePhoto = (indexToRemove: number) => {
    setFormData((prev) => ({
      ...prev,
      gallery_images: prev.gallery_images.filter((_, idx) => idx !== indexToRemove)
    }));
    setIsSaved(false);
  };

  // Set Photo as Hero
  const handleSetAsHero = (url: string) => {
    setFormData((prev) => ({ ...prev, hero_image: url }));
    setIsSaved(false);
  };

  // Toggle Amenity
  const handleToggleAmenity = (amenity: string) => {
    setFormData((prev) => {
      const exists = prev.amenities.includes(amenity);
      return {
        ...prev,
        amenities: exists
          ? prev.amenities.filter((a) => a !== amenity)
          : [...prev.amenities, amenity]
      };
    });
    setIsSaved(false);
  };

  // Add Custom Amenity
  const handleAddCustomAmenity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomAmenity.trim()) return;
    if (!formData.amenities.includes(newCustomAmenity.trim())) {
      setFormData((prev) => ({
        ...prev,
        amenities: [...prev.amenities, newCustomAmenity.trim()]
      }));
    }
    setNewCustomAmenity('');
    setIsSaved(false);
  };

  // Save changes
  const handleSave = () => {
    onSaveProperty(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3500);
  };

  const currentUnit = formData.units[selectedUnitIndex] || formData.units[0];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Top Action Bar & Property Selector */}
      <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sticky top-18 z-30">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#26130F] text-[#C5A880] flex items-center justify-center font-bold shrink-0 shadow">
            <Building2 className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#8C6239] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                דשבורד בעלים ומנהלים
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                <span>מתחם מאומת ב-ResortOS (0% עמלה)</span>
              </span>
            </div>

            {/* Property Switcher Dropdown */}
            <div className="flex items-center gap-2 mt-1">
              <label htmlFor="property-switcher" className="sr-only">בחירת מתחם לעריכה</label>
              <select
                id="property-switcher"
                value={formData.id}
                onChange={(e) => onSelectProperty(e.target.value)}
                className="font-extrabold text-lg sm:text-xl text-[#26130F] bg-transparent border-b-2 border-stone-200 hover:border-[#C5A880] focus:border-[#C5A880] focus:outline-none cursor-pointer pr-1 pl-4"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.hebrew_name} ({p.village})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          {onPreviewPublicListing && (
            <button
              type="button"
              onClick={() => onPreviewPublicListing(formData.id)}
              className="py-2.5 px-3.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Eye className="w-3.5 h-3.5 text-stone-600" />
              <span>צפייה כפי שהאורח רואה</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            className={`py-2.5 px-5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] ${
              isSaved
                ? 'bg-emerald-600 text-white'
                : 'bg-[#26130F] hover:bg-[#3F2C29] text-white'
            }`}
          >
            {isSaved ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>השינויים נשמרו בהצלחה!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-[#C5A880]" />
                <span>שמור שינויים</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor Main Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-stone-200 text-xs font-bold">
        {[
          { id: 'info', label: 'פרטים כלליים ומיתוג', icon: Building2 },
          { id: 'photos', label: 'תמונות וגלריה', icon: ImageIcon, badge: formData.gallery_images.length },
          { id: 'units', label: 'יחידות אירוח ומחירים', icon: BedDouble, badge: formData.units.length },
          { id: 'amenities', label: 'מתקנים ושירותים', icon: Sparkles, badge: formData.amenities.length },
          { id: 'guides', label: 'חוויית חדר ו-Wi-Fi', icon: Wifi }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all shrink-0 ${
                isActive
                  ? 'bg-[#26130F] text-white shadow font-black'
                  : 'bg-white hover:bg-stone-100 text-stone-600 border border-stone-200'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#C5A880]' : 'text-stone-500'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-[#C5A880] text-[#26130F]' : 'bg-stone-200 text-stone-700'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: GENERAL INFO & BRANDING */}
      {/* ========================================================================= */}
      {activeTab === 'info' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6 animate-fadeIn">
          <div className="border-b border-stone-200 pb-4">
            <h3 className="text-lg font-extrabold text-[#26130F]">פרטי המתחם והגדרות מיתוג</h3>
            <p className="text-xs text-stone-500">מידע זה מוצג לאורחים במרקטפלייס ובכרטיסיית המתחם.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">שם המתחם בעברית *</label>
              <input
                type="text"
                value={formData.hebrew_name}
                onChange={(e) => handleChange('hebrew_name', e.target.value)}
                placeholder="למשל: טוסקנה ברמות"
                className="w-full p-3 rounded-xl border border-stone-300 text-xs font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">שם המתחם באנגלית / תעתיק</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Toscana Ramot"
                className="w-full p-3 rounded-xl border border-stone-300 text-xs font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">מזהה כתובת URL (Slug)</label>
              <div className="flex items-center">
                <span className="p-3 bg-stone-100 border border-l-0 border-stone-300 rounded-r-xl text-stone-400 text-xs font-mono">
                  resortos.app/resort/
                </span>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => handleChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  className="w-full p-3 rounded-l-xl border border-stone-300 text-xs font-bold font-mono focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">יישוב / מושב *</label>
              <input
                type="text"
                value={formData.village}
                onChange={(e) => handleChange('village', e.target.value)}
                placeholder="מושב רמות"
                className="w-full p-3 rounded-xl border border-stone-300 text-xs font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">אזור גיאוגרפי</label>
              <select
                value={formData.region}
                onChange={(e) => handleChange('region', e.target.value)}
                className="w-full p-3 rounded-xl border border-stone-300 text-xs font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none bg-white"
              >
                <option value="רמת הגולן">רמת הגולן</option>
                <option value="סובב כנרת">סובב כנרת</option>
                <option value="גליל עליון">גליל עליון</option>
                <option value="גליל מערבי">גליל מערבי</option>
                <option value="גליל תחתון">גליל תחתון</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">כתובת מלאה או תיאור הגעה</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="רחוב הברוש, מושב רמות"
                className="w-full p-3 rounded-xl border border-stone-300 text-xs font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">מספר וואטסאפ לבירורים ישירים *</label>
              <input
                type="text"
                value={formData.whatsapp_number}
                onChange={(e) => handleChange('whatsapp_number', e.target.value)}
                placeholder="0548076123 או 972548076123"
                className="w-full p-3 rounded-xl border border-stone-300 text-xs font-mono font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none text-left"
              />
              <span className="text-[10px] text-stone-400 mt-1 block">
                הודעות מאורחים יועברו ישירות למספר זה ללא עמלות תיווך.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">טלפון ליצירת קשר</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="054-807-6123"
                className="w-full p-3 rounded-xl border border-stone-300 text-xs font-mono font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none text-left"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">משפט שיווקי מוביל (Tagline)</label>
            <input
              type="text"
              value={formData.tagline}
              onChange={(e) => handleChange('tagline', e.target.value)}
              placeholder="3 בקתות עץ יוקרתיות מול נוף פנורמי לכנרת"
              className="w-full p-3 rounded-xl border border-stone-300 text-xs font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">תיאור מפורט של המתחם והאווירה</label>
            <textarea
              rows={4}
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="תארו את חוויית האירוח, השקט, הנוף, המתקנים והפינוקים הממתינים לאורחים..."
              className="w-full p-3 rounded-xl border border-stone-300 text-xs leading-relaxed focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
            />
          </div>

          {/* Direct Booking Toggle */}
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 flex items-center justify-between gap-4">
            <div>
              <div className="font-bold text-xs text-[#26130F] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>הפעלת מנוע הזמנות ישיר ב-0% עמלה</span>
              </div>
              <p className="text-[11px] text-stone-600 mt-0.5">
                כאשר מאופשר, אורחים יוכלו לסגור מקדמה מאובטחת ולנעול תאריכים ישירות ביומן שלכם.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={formData.direct_booking_enabled}
                onChange={(e) => handleChange('direct_booking_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PHOTOS & GALLERY MANAGER */}
      {/* ========================================================================= */}
      {activeTab === 'photos' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8 animate-fadeIn">
          <div className="border-b border-stone-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-extrabold text-[#26130F]">ניהול גלריית תמונות ומדיה</h3>
              <p className="text-xs text-stone-500">
                תמונות איכותיות מגדילות את יחס ההמרה והפניות בוואטסאפ בעד 340%.
              </p>
            </div>
            <span className="text-xs font-bold text-[#8C6239] bg-amber-50 px-3 py-1 rounded-full border border-amber-200 self-start sm:self-auto">
              {formData.gallery_images.length + 1} תמונות בסך הכל
            </span>
          </div>

          {/* Hero Banner Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-stone-700">
                תמונה ראשית מובילה (Hero Image)
              </label>
              <button
                type="button"
                onClick={() => {
                  setStudioTargetImage(formData.hero_image || '');
                  setStudioModalOpen(true);
                }}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-black text-xs px-3.5 py-1.5 rounded-xl shadow flex items-center gap-1.5 transition active:scale-95 border border-amber-300"
              >
                <Sparkles className="w-3.5 h-3.5 text-stone-950" />
                <span>סטודיו שיפור AI (Flux)</span>
              </button>
            </div>
            <div className="relative h-64 sm:h-80 rounded-2xl overflow-hidden border-2 border-stone-200 shadow-md group">
              <img
                src={formData.hero_image}
                alt="תמונה ראשית של המתחם"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-between p-6">
                <div>
                  <span className="bg-[#C5A880] text-[#26130F] text-[10px] font-black px-2.5 py-1 rounded-md uppercase">
                    תמונה ראשית נוכחית
                  </span>
                  <h4 className="text-white font-extrabold text-lg mt-1">{formData.hebrew_name}</h4>
                  <p className="text-stone-300 text-xs">{formData.village}</p>
                </div>
                <div className="text-white text-xs font-mono bg-black/60 px-3 py-1.5 rounded-lg border border-white/20 truncate max-w-xs">
                  {formData.hero_image}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={formData.hero_image}
                onChange={(e) => handleChange('hero_image', e.target.value)}
                placeholder="הזינו קישור ישיר לתמונה ראשית (URL)..."
                className="flex-1 p-3 rounded-xl border border-stone-300 text-xs font-mono focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
              />
            </div>
          </div>

          {/* Add New Gallery Image */}
          <div className="space-y-3 p-5 rounded-2xl bg-stone-50 border border-stone-200">
            <h4 className="text-xs font-bold text-stone-800 flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#C5A880]" />
              <span>הוספת תמונה חדשה לגלריה</span>
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPhotoUrl}
                onChange={(e) => setNewPhotoUrl(e.target.value)}
                placeholder="הדביקו קישור לתמונה חדשה (https://...)..."
                className="flex-1 p-3 rounded-xl border border-stone-300 text-xs font-mono focus:ring-2 focus:ring-[#C5A880] focus:outline-none bg-white"
              />
              <button
                type="button"
                onClick={() => handleAddPhoto(newPhotoUrl)}
                className="py-3 px-5 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white text-xs font-bold shadow shrink-0 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>הוסף לגלריה</span>
              </button>
            </div>

            {/* Quick Presets */}
            <div className="pt-2">
              <span className="text-[11px] font-bold text-stone-500 block mb-2">
                או בחר מתמונות הדגמה ברזולוציה גבוהה:
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESET_PHOTOS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAddPhoto(preset.url)}
                    className="text-[11px] font-bold py-1 px-2.5 rounded-lg bg-white border border-stone-200 text-stone-700 hover:border-[#C5A880] hover:text-[#8C6239] transition-all flex items-center gap-1"
                  >
                    <span>+ {preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Gallery Images Grid */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-stone-800">
              תמונות הגלריה ({formData.gallery_images.length})
            </h4>

            {formData.gallery_images.length === 0 ? (
              <div className="p-8 text-center text-stone-400 bg-stone-50 rounded-2xl border border-dashed border-stone-300">
                אין תמונות נוספות בגלריה. הוסיפו תמונות למעלה כדי להציג לאורח את כל חלקי המתחם.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {formData.gallery_images.map((imgUrl, idx) => (
                  <div
                    key={idx}
                    className="group relative rounded-2xl overflow-hidden border border-stone-200 shadow-sm bg-stone-100 flex flex-col"
                  >
                    <div className="h-44 overflow-hidden relative">
                      <img
                        src={imgUrl}
                        alt={`גלריה ${idx + 1}`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                        #{idx + 1}
                      </div>
                    </div>

                    <div className="p-3 bg-white flex items-center justify-between gap-2 border-t border-stone-100">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSetAsHero(imgUrl)}
                          className="text-[11px] font-bold text-[#8C6239] hover:underline flex items-center gap-1"
                          title="הגדר תמונה זו כתמונה הראשית של המתחם"
                        >
                          <Camera className="w-3.5 h-3.5 text-[#C5A880]" />
                          <span>קבע כראשית</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setStudioTargetImage(imgUrl);
                            setStudioModalOpen(true);
                          }}
                          className="text-[10px] font-bold text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg border border-amber-200 flex items-center gap-1 transition shadow-2xs"
                          title="שפר תמונה זו ב-AI Studio"
                        >
                          <Wand2 className="w-3 h-3 text-amber-600" />
                          <span>ערוך ב-AI</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        title="מחק תמונה מהגלריה"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: UNITS & PRICING ENGINE */}
      {/* ========================================================================= */}
      {activeTab === 'units' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6 animate-fadeIn">
          <div className="border-b border-stone-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold text-[#26130F]">ניהול יחידות אירוח ומחירים</h3>
              <p className="text-xs text-stone-500">
                הגדירו בקתות, סוויטות, תפוסה ומחירי אמצ״ש וסופ״ש לכל יחידה בנפרד.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddUnit}
              className="py-2.5 px-4 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white text-xs font-bold flex items-center gap-2 shadow"
            >
              <Plus className="w-4 h-4 text-[#C5A880]" />
              <span>הוסף יחידת אירוח חדשה</span>
            </button>
          </div>

          {/* Unit Selector Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {formData.units.map((unit, idx) => (
              <button
                key={unit.id || idx}
                type="button"
                onClick={() => setSelectedUnitIndex(idx)}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                  selectedUnitIndex === idx
                    ? 'bg-[#26130F] text-white shadow'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <BedDouble className={`w-3.5 h-3.5 ${selectedUnitIndex === idx ? 'text-[#C5A880]' : 'text-stone-500'}`} />
                <span>{unit.name}</span>
                <span className="text-[10px] bg-stone-700 text-stone-300 px-1.5 py-0.2 rounded-full">
                  ₪{unit.base_price}
                </span>
              </button>
            ))}
          </div>

          {/* Selected Unit Form Card */}
          {currentUnit && (
            <div className="p-6 rounded-2xl bg-[#FDFBF7] border border-[#E8DED8] space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#C5A880] text-[#26130F] font-black text-xs flex items-center justify-center">
                    {selectedUnitIndex + 1}
                  </span>
                  <h4 className="font-extrabold text-base text-[#26130F]">{currentUnit.name}</h4>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteUnit(selectedUnitIndex)}
                  className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 p-1.5 rounded-lg hover:bg-red-50"
                  title="מחיקת יחידה זו"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>מחק יחידה</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">שם היחידה *</label>
                  <input
                    type="text"
                    value={currentUnit.name}
                    onChange={(e) => handleUnitChange(selectedUnitIndex, 'name', e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold bg-white focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">סוג יחידה</label>
                  <select
                    value={currentUnit.type}
                    onChange={(e) => handleUnitChange(selectedUnitIndex, 'type', e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold bg-white focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  >
                    <option value="cabin">בקתת עץ (Cabin)</option>
                    <option value="suite">סוויטת יוקרה (Suite)</option>
                    <option value="villa">וילת אירוח (Villa)</option>
                    <option value="dome">כיפה גאודזית (Dome)</option>
                    <option value="tent">אוהל גלמפינג (Glamping Tent)</option>
                    <option value="room">חדר אירוח (Room)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">תפוסה מקסימלית (אורחים)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={currentUnit.max_occupancy}
                    onChange={(e) => handleUnitChange(selectedUnitIndex, 'max_occupancy', parseInt(e.target.value) || 2)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold bg-white focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">מחיר לילה באמצ״ש (₪) *</label>
                  <input
                    type="number"
                    step={50}
                    value={currentUnit.base_price}
                    onChange={(e) => handleUnitChange(selectedUnitIndex, 'base_price', parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold bg-white focus:ring-2 focus:ring-[#C5A880] focus:outline-none text-emerald-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">מחיר לילה בסופ״ש (₪) *</label>
                  <input
                    type="number"
                    step={50}
                    value={currentUnit.weekend_price}
                    onChange={(e) => handleUnitChange(selectedUnitIndex, 'weekend_price', parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold bg-white focus:ring-2 focus:ring-[#C5A880] focus:outline-none text-emerald-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">שטח במ״ר</label>
                  <input
                    type="number"
                    value={currentUnit.size_m2 || ''}
                    onChange={(e) => handleUnitChange(selectedUnitIndex, 'size_m2', parseInt(e.target.value) || undefined)}
                    placeholder="45"
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold bg-white focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">חדרי שינה</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={currentUnit.bedrooms}
                    onChange={(e) => handleUnitChange(selectedUnitIndex, 'bedrooms', parseInt(e.target.value) || 1)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold bg-white focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">חדרי רחצה</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={currentUnit.bathrooms}
                    onChange={(e) => handleUnitChange(selectedUnitIndex, 'bathrooms', parseInt(e.target.value) || 1)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold bg-white focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  />
                </div>
              </div>

              {/* Unit Special Features */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-2">
                  מאפיינים מיוחדים של היחידה (מוצג כצ׳יפים לאורח)
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    'ג׳קוזי ספא מול הנוף',
                    'מרפסת דק פרטית',
                    'בריכה פרטית צמודה',
                    'קומת גלריה לילדים',
                    'מכונת קפה אספרסו',
                    'מטבחון שף מאובזר',
                    'חצר פרטית מגודרת'
                  ].map((feat, fIdx) => {
                    const isSelected = currentUnit.features.includes(feat);
                    return (
                      <button
                        key={fIdx}
                        type="button"
                        onClick={() => {
                          const updated = isSelected
                            ? currentUnit.features.filter((f) => f !== feat)
                            : [...currentUnit.features, feat];
                          handleUnitChange(selectedUnitIndex, 'features', updated);
                        }}
                        className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-[#26130F] text-[#C5A880] shadow-sm'
                            : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        <span>{feat}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: AMENITIES & HIGHLIGHTS */}
      {/* ========================================================================= */}
      {activeTab === 'amenities' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6 animate-fadeIn">
          <div className="border-b border-stone-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold text-[#26130F]">מתקנים ושירותים במתחם</h3>
              <p className="text-xs text-stone-500">
                סמנו את כל המתקנים הזמינים. סימונים אלה משמשים ישירות לסינון במרקטפלייס.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              {formData.amenities.length} מתקנים נבחרו
            </span>
          </div>

          {/* Active Amenities Full Display - All selected amenities visible with X */}
          <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                כל המתקנים הפעילים שנבחרו למתחם ({formData.amenities.length}):
              </span>
              <span className="text-[11px] font-bold text-emerald-800 bg-white px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                מופיעים ישירות באתר
              </span>
            </div>

            {formData.amenities.length === 0 ? (
              <p className="text-xs text-stone-500 italic py-1">
                לא נבחרו מתקנים עדיין. סמנו מהרשימות מטה או הוסיפו מתקן חדש.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {formData.amenities.map((amenity, idx) => (
                  <span
                    key={`${amenity}-${idx}`}
                    className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-white border border-emerald-300 text-emerald-950 text-xs font-bold shadow-2xs hover:border-red-300 transition-colors"
                  >
                    <span>{amenity}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleAmenity(amenity)}
                      className="w-4 h-4 rounded-full bg-stone-100 hover:bg-red-100 hover:text-red-700 text-stone-400 flex items-center justify-center transition-colors mr-1"
                      title={`הסר את ${amenity}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-emerald-800/80 font-medium">
              💡 טיפ: לחיצה על ✕ תסיר את המתקן מיידית. לחיצה על מתקנים ברשימות למטה תוסיף/תסיר אותם.
            </p>
          </div>

          {/* Categorized Checkboxes */}
          <div className="space-y-6">
            {AMENITY_CATEGORIES.map((cat, cIdx) => (
              <div key={cIdx} className="space-y-3">
                <h4 className="text-xs font-black text-[#8C6239] uppercase tracking-wider">
                  {cat.category}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {cat.items.map((amenity, aIdx) => {
                    const isChecked = formData.amenities.includes(amenity);
                    return (
                      <button
                        key={aIdx}
                        type="button"
                        onClick={() => handleToggleAmenity(amenity)}
                        className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                          isChecked
                            ? 'bg-[#26130F] text-white border-[#26130F] shadow-sm'
                            : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                        }`}
                      >
                        <span>{amenity}</span>
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold ${
                            isChecked ? 'bg-[#C5A880] text-[#26130F]' : 'border border-stone-300'
                          }`}
                        >
                          {isChecked && '✓'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Add Custom Amenity Form */}
          <form onSubmit={handleAddCustomAmenity} className="pt-4 border-t border-stone-200 flex gap-2">
            <input
              type="text"
              value={newCustomAmenity}
              onChange={(e) => setNewCustomAmenity(e.target.value)}
              placeholder="הוסף מתקן או שירות מותאם אישית..."
              className="flex-1 p-3 rounded-xl border border-stone-300 text-xs font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
            />
            <button
              type="submit"
              className="py-3 px-5 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white text-xs font-bold shadow shrink-0"
            >
              הוסף מתקן
            </button>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: GUEST EXPERIENCE & ROOM GUIDES */}
      {/* ========================================================================= */}
      {activeTab === 'guides' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6 animate-fadeIn">
          <div className="border-b border-stone-200 pb-4">
            <h3 className="text-lg font-extrabold text-[#26130F]">חוויית אורח בחדר והגדרות Wi-Fi</h3>
            <p className="text-xs text-stone-500">
              פרטים אלה יופיעו במדריכי הקומיקס המודפסים (A4) ובשידור לטלוויזיית החדר.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                שם רשת ה-Wi-Fi בחדר (SSID)
              </label>
              <input
                type="text"
                value={formData.wifi_ssid || ''}
                onChange={(e) => handleChange('wifi_ssid', e.target.value)}
                placeholder="Toscana_Guest_5G"
                className="w-full p-3 rounded-xl border border-stone-300 text-xs font-mono font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                סיסמת רשת ה-Wi-Fi
              </label>
              <input
                type="text"
                value={formData.wifi_password || ''}
                onChange={(e) => handleChange('wifi_password', e.target.value)}
                placeholder="golanparadise"
                className="w-full p-3 rounded-xl border border-stone-300 text-xs font-mono font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              הודעת ברכה אישית מהמארח לאורחים
            </label>
            <textarea
              rows={3}
              value={formData.host_welcome_notes || ''}
              onChange={(e) => handleChange('host_welcome_notes', e.target.value)}
              placeholder="ברוכים הבאים לחופשה שלכם אצלנו! הכנו עבורכם קפה איכותי ומדריך קצר להפעלת הג׳קוזי..."
              className="w-full p-3 rounded-xl border border-stone-300 text-xs leading-relaxed focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              קישור לתמונת אווטאר המארח (Host Portrait URL)
            </label>
            <input
              type="text"
              value={formData.host_avatar_url || ''}
              onChange={(e) => handleChange('host_avatar_url', e.target.value)}
              placeholder="https://images.unsplash.com/photo-..."
              className="w-full p-3 rounded-xl border border-stone-300 text-xs font-mono focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
            />
          </div>

          {/* Direct Link to Room Guides Tab */}
          {onOpenRoomGuides && (
            <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                  <Tv className="w-4 h-4 text-[#C5A880]" />
                  <span>מדריכי קומיקס מאוירים לחדר (A4 ושידור לטלוויזיה)</span>
                </h4>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  צפו במדריך מכונת הנספרסו והג׳קוזי עם הפרטים שלכם, הדפיסו דף אחד מדויק לחדר או שדרו ל-TV.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onOpenRoomGuides(formData.id)}
                className="py-2.5 px-4 rounded-xl bg-[#26130F] text-white text-xs font-bold shadow shrink-0 flex items-center gap-1.5"
              >
                <span>עבור למדריכי הקומיקס</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI Photo Studio Modal */}
      <AIPhotoStudioModal
        isOpen={studioModalOpen}
        onClose={() => setStudioModalOpen(false)}
        initialImageUrl={studioTargetImage || formData.hero_image || ''}
        propertyName={formData.hebrew_name || formData.name}
        propertyVillage={formData.village}
        onSaveHeroImage={(url) => {
          setFormData((prev) => ({ ...prev, hero_image: url }));
          onSaveProperty({ ...formData, hero_image: url });
          setIsSaved(true);
        }}
        onSaveToGallery={(url) => {
          setFormData((prev) => ({
            ...prev,
            gallery_images: [url, ...prev.gallery_images]
          }));
          onSaveProperty({
            ...formData,
            gallery_images: [url, ...formData.gallery_images]
          });
          setIsSaved(true);
        }}
      />
    </div>
  );
};
