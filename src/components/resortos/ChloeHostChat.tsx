import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Smartphone,
  ExternalLink,
  MessageCircle,
  CheckCircle2,
  Building2,
  RefreshCw,
  Eye,
  Sliders,
  Check,
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Calendar,
  Share2,
  BookOpen,
  Copy,
  X,
  Terminal,
  Cpu,
  Upload,
  Trash2,
  Star,
  Plus,
  Flame,
  Coffee,
  Wifi,
  Waves,
  DollarSign
} from 'lucide-react';
import { ManagedProperty } from './HostPropertyEditor';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'chloe';
  text: string;
  timestamp: string;
  actionTaken?: {
    type: 'price' | 'photo' | 'amenity' | 'description' | 'wifi' | 'general';
    summary: string;
  };
  widget?: 'main_categories' | 'photo_manager' | 'amenities_manager' | 'pricing_manager' | 'description_review' | 'description_options';
}

export interface ChloeHostChatProps {
  properties: ManagedProperty[];
  activePropertyId: string;
  onSelectProperty: (propertyId: string) => void;
  onUpdateProperty: (updatedProperty: ManagedProperty) => void;
  onOpenManualEditor?: () => void;
  onOpenPublicListing?: (slug: string) => void;
  className?: string;
}

// Preset photo options Chloe can pull from
const CHLOE_PHOTO_LIBRARY = [
  { keywords: ['בריכה', 'נוף', 'פנורמי', 'כנרת'], url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80', label: 'בריכה פרטית מול נוף פנורמי' },
  { keywords: ['בקתה', 'עץ', 'כפרי', 'טבע'], url: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80', label: 'בקתת עץ שוויצרית בטבע' },
  { keywords: ['ג׳קוזי', 'ספא', 'מים', 'חם'], url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80', label: 'ג׳קוזי ספא חיצוני מפואר' },
  { keywords: ['סוויטה', 'עיצוב', 'פנים', 'מיטה'], url: 'https://images.unsplash.com/photo-1587061949409-02df41d5e562?auto=format&fit=crop&w=1200&q=80', label: 'סוויטת בוטיק מעוצבת ורומנטית' },
  { keywords: ['שקיעה', 'דק', 'מרפסת', 'ערב'], url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80', label: 'מרפסת דק מול שקיעה מרהיבה' }
];

// Key canonical amenities requested by resort hosts
const CANONICAL_AMENITIES = [
  { id: 'wifi', label: 'אינטרנט Wi-Fi מהיר חופשי', icon: '📶' },
  { id: 'sea_view', label: 'נוף לים / נוף פנורמי לכנרת', icon: '🌊' },
  { id: 'stove', label: 'כיריים חשמליות ומטבחון מאובזר', icon: '🍳' },
  { id: 'fireplace', label: 'קמין עצים רומנטי', icon: '🔥' },
  { id: 'nespresso', label: 'מכונת אספרסו נספרסו וקפסולות', icon: '☕' },
  { id: 'jacuzzi', label: 'ג׳קוזי ספא ענק חיצוני', icon: '🛁' },
  { id: 'pool_heated', label: 'בריכה פרטית מחוממת ומקורה', icon: '🏊‍♂️' },
  { id: 'ev_charger', label: 'עמדת טעינה לרכב חשמלי (EV)', icon: '⚡' },
  { id: 'bbq', label: 'עמדת מנגל BBQ מקצועית', icon: '🥩' },
  { id: 'kosher', label: 'מתאים לדתיים (פלטה ומיחם שבת)', icon: '✡️' },
  { id: 'ac', label: 'מיזוג אוויר מלא בכל החדרים', icon: '❄️' },
  { id: 'parking', label: 'חניה פרטית צמודה ללא תשלום', icon: '🅿️' },
  { id: 'baby_crib', label: 'עריסת תינוק ומותאם למשפחות', icon: '👶' },
  { id: 'breakfast', label: 'אפשרות לארוחת בוקר גלילית כפרית', icon: '🥐' },
  { id: 'spa_treatments', label: 'טיפולי ספא ומסאז׳ בתיאום מראש', icon: '💆‍♀️' }
];

// Helper to assign relevant emoji icon to any amenity (scraped, custom, or canonical)
const getAmenityIcon = (label: string): string => {
  const l = (label || '').toLowerCase();
  if (l.includes('בריכ') || l.includes('מים') || l.includes('pool')) return '🏊‍♂️';
  if (l.includes('ג׳קוזי') || l.includes("ג'קוזי") || l.includes('ספא') || l.includes('jacuzzi')) return '🛁';
  if (l.includes('קפה') || l.includes('אספרסו') || l.includes('coffee') || l.includes('nespresso')) return '☕';
  if (l.includes('wifi') || l.includes('אינטרנט') || l.includes('רשת')) return '📶';
  if (l.includes('מנגל') || l.includes('bbq') || l.includes('גריל') || l.includes('בשר')) return '🥩';
  if (l.includes('נוף') || l.includes('ים') || l.includes('כנרת') || l.includes('view')) return '🌊';
  if (l.includes('קמין') || l.includes('אש') || l.includes('מדורה') || l.includes('חימום')) return '🔥';
  if (l.includes('מיקרוגל') || l.includes('מקרר') || l.includes('מטבח') || l.includes('כיריים')) return '🍳';
  if (l.includes('טלוויזיה') || l.includes('tv') || l.includes('yes') || l.includes('hot')) return '📺';
  if (l.includes('דתי') || l.includes('כשר') || l.includes('שבת') || l.includes('מיחם')) return '✡️';
  if (l.includes('מיזוג') || l.includes('מזגן') || l.includes('קור')) return '❄️';
  if (l.includes('חניה') || l.includes('רכב') || l.includes('parking')) return '🅿️';
  if (l.includes('ילד') || l.includes('תינוק') || l.includes('מיטה')) return '👶';
  if (l.includes('טעינה') || l.includes('ev') || l.includes('חשמלי')) return '⚡';
  if (l.includes('ארוח') || l.includes('בוקר')) return '🥐';
  if (l.includes('מסאז') || l.includes('טיפול')) return '💆‍♀️';
  return '✨';
};

// Helper to determine if a canonical suggestion is already satisfied by active amenities
const isAmenityCovered = (canonical: (typeof CANONICAL_AMENITIES)[0], activeAmenities: string[]) => {
  return activeAmenities.some((active) => {
    if (active === canonical.label) return true;
    if (canonical.id === 'wifi' && (active.includes('Wi-Fi') || active.includes('אינטרנט'))) return true;
    if (canonical.id === 'jacuzzi' && (active.includes('ג׳קוזי') || active.includes("ג'קוזי"))) return true;
    if (canonical.id === 'pool_heated' && active.includes('בריכ')) return true;
    if (canonical.id === 'nespresso' && (active.includes('נספרסו') || active.includes('אספרסו'))) return true;
    if (canonical.id === 'bbq' && (active.includes('מנגל') || active.includes('BBQ') || active.includes('גריל'))) return true;
    if (canonical.id === 'sea_view' && (active.includes('נוף לים') || active.includes('נוף פנורמי'))) return true;
    if (canonical.id === 'stove' && (active.includes('כיריים') || active.includes('מטבח'))) return true;
    if (canonical.id === 'fireplace' && (active.includes('קמין') || active.includes('עצים'))) return true;
    if (canonical.id === 'kosher' && (active.includes('דתיים') || active.includes('שבת'))) return true;
    if (canonical.id === 'ac' && (active.includes('מיזוג') || active.includes('מזגן'))) return true;
    if (canonical.id === 'parking' && active.includes('חניה')) return true;
    if (canonical.id === 'ev_charger' && (active.includes('טעינה') || active.includes('EV'))) return true;
    if (canonical.id === 'baby_crib' && (active.includes('עריס') || active.includes('תינוק'))) return true;
    if (canonical.id === 'breakfast' && (active.includes('בוקר') || active.includes('ארוח'))) return true;
    if (canonical.id === 'spa_treatments' && (active.includes('מסאז') || active.includes('טיפול'))) return true;
    return false;
  });
};

export const ChloeHostChat: React.FC<ChloeHostChatProps> = ({
  properties,
  activePropertyId,
  onSelectProperty,
  onUpdateProperty,
  onOpenManualEditor,
  onOpenPublicListing,
  className = ''
}) => {
  const currentProp = properties.find((p) => p.id === activePropertyId) || properties[0];

  // Initial welcome message with guided categories widget
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'm-welcome',
      sender: 'chloe',
      text: `היי! אני קלואי, מנהלת הליווי החכמה שלך ב-ResortOS ✨\nאני כאן כדי לדאוג ש${currentProp?.hebrew_name || 'המתחם שלך'} ייראה מושלם, יעודכן בלחיצה אחת ויביא מקסימום סגירות ישירות ב-0% עמלת תיווך.\n\nבמה תרצה שנתמקד ונעדכן עכשיו?`,
      timestamp: 'עכשיו',
      widget: 'main_categories'
    }
  ]);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [previewPulse, setPreviewPulse] = useState(false);
  const [isLocalOllamaOnline, setIsLocalOllamaOnline] = useState<boolean>(false);
  const [showGuidelinesModal, setShowGuidelinesModal] = useState<boolean>(false);
  const [copiedGuidelines, setCopiedGuidelines] = useState<boolean>(false);
  
  // Custom amenity input state
  const [customAmenityInput, setCustomAmenityInput] = useState('');

  // Pricing form local state (synced with currentProp)
  const [formBasePrice, setFormBasePrice] = useState<number>(currentProp?.units?.[0]?.base_price || 850);
  const [formWeekendPrice, setFormWeekendPrice] = useState<number>(currentProp?.units?.[0]?.weekend_price || 1100);
  const [formHolidaySurcharge, setFormHolidaySurcharge] = useState<number>(currentProp?.holiday_surcharge_percent || 0);
  const [formChildFee, setFormChildFee] = useState<number>(currentProp?.extra_child_fee ?? 150);
  const [formAllowsPets, setFormAllowsPets] = useState<boolean>(currentProp?.allows_pets ?? false);
  const [formPetFee, setFormPetFee] = useState<number>(currentProp?.pet_fee ?? 100);
  const [formCleaningFee, setFormCleaningFee] = useState<number>(currentProp?.cleaning_fee ?? 0);

  // Marketing Copywriting local state
  const [manualTagline, setManualTagline] = useState<string>(currentProp?.tagline || '');
  const [manualDescription, setManualDescription] = useState<string>(currentProp?.description || '');

  // Sync pricing and copywriting state when active property changes
  useEffect(() => {
    if (currentProp) {
      setFormBasePrice(currentProp.units?.[0]?.base_price || 850);
      setFormWeekendPrice(currentProp.units?.[0]?.weekend_price || 1100);
      setFormHolidaySurcharge(currentProp.holiday_surcharge_percent || 0);
      setFormChildFee(currentProp.extra_child_fee ?? 150);
      setFormAllowsPets(currentProp.allows_pets ?? false);
      setFormPetFee(currentProp.pet_fee ?? 100);
      setFormCleaningFee(currentProp.cleaning_fee ?? 0);
      setManualTagline(currentProp.tagline || '');
      setManualDescription(currentProp.description || '');
    }
  }, [currentProp?.id]);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if Ollama daemon is reachable on local Mac Studio
  useEffect(() => {
    fetch('http://127.0.0.1:11434/api/tags', { method: 'GET' })
      .then((r) => {
        if (r.ok) setIsLocalOllamaOnline(true);
      })
      .catch(() => setIsLocalOllamaOnline(false));
  }, []);

  // Auto scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Flash mobile preview when updated
  const triggerPreviewPulse = () => {
    setPreviewPulse(true);
    setTimeout(() => setPreviewPulse(false), 2000);
  };

  // Switch to a specific guided category flow
  const handleSelectFlow = (flow: 'photo_manager' | 'amenities_manager' | 'pricing_manager' | 'description_review' | 'description_options' | 'main_categories') => {
    if (!currentProp) return;

    let userPromptText = '';
    let chloeResponseText = '';

    if (flow === 'photo_manager') {
      userPromptText = 'אני רוצה לעדכן תמונות וגלריה 📸';
      chloeResponseText = `מעולה! הנה כל התמונות הקיימות כרגע במתחם "${currentProp.hebrew_name}".\nתוכל בלחיצה לבחור מה התמונה הראשית שתופיע לאורחים, למחוק תמונות שלא מתאימות, או להעלות תמונות חדשות ישירות מהטלפון או מהמחשב:`;
    } else if (flow === 'amenities_manager') {
      userPromptText = 'אני רוצה לעדכן מאפיינים ומתקנים ✨';
      chloeResponseText = `בשמחה! הנה כל המאפיינים והמתקנים של המתחם (${currentProp.amenities.length} פעילים כרגע).\nלמעלה מוצגים במלואם כל המתקנים הפעילים עם אפשרות להסיר בלחיצה על ✕, ומתחת תוכל להוסיף מאפיינים מומלצים בלחיצה או להקליד מאפיין מותאם אישית:`;
    } else if (flow === 'pricing_manager') {
      userPromptText = 'אני רוצה לעדכן מחירים ותוספות 💰';
      chloeResponseText = `בוא נעשה סדר במחירון של המתחם!\nכאן תוכל לקבוע מחירי אמצ״ש וסופ״ש קבועים, תוספות על תאריכים מיוחדים/חגים, וכן תוספות על ילדים, כלבים ודמי ניקיון:`;
    } else if (flow === 'description_review') {
      userPromptText = 'אני רוצה לבדוק ולעדכן את התיאור השיווקי והסלוגן ✍️';
      chloeResponseText = `הנה התיאור והסלוגן המעודכנים כרגע במתחם "${currentProp.hebrew_name}".\nהאם תרצה שאציע לך 3 גרסאות שיווקיות חדשות ומזמינות לבחירה, או שתעדיף לערוך ולנסח בעצמך?`;
    } else if (flow === 'description_options') {
      userPromptText = 'אשמח שתציעי לי 3 גרסאות שיווקיות לבחירה ✨';
      chloeResponseText = `בכיף! ניסחתי עבור ${currentProp.hebrew_name} 3 גרסאות שיווקיות בסגנונות שונים שמושכות אורחים לסגירה ישירה. תוכל לבחור בלחיצה אחת את הגרסה שהכי מדברת אליך, או לנסח בעצמך באפשרות הרביעית למטה:`;
    } else {
      userPromptText = 'חזרה לאפשרויות הראשיות';
      chloeResponseText = 'במה נוסף תרצה שנעדכן? בחר אחת מהאפשרויות הבאות:';
    }

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      sender: 'user',
      text: userPromptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const chloeMsg: ChatMessage = {
      id: `msg-c-${Date.now() + 1}`,
      sender: 'chloe',
      text: chloeResponseText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      widget: flow
    };

    setMessages((prev) => [...prev, userMsg, chloeMsg]);
  };

  // Apply chosen description option or manual edit
  const handleApplyDescription = (newTagline: string, newDesc: string, optionLabel: string) => {
    if (!currentProp) return;

    const updated = {
      ...currentProp,
      tagline: newTagline,
      description: newDesc
    };

    onUpdateProperty(updated);
    triggerPreviewPulse();
    setManualTagline(newTagline);
    setManualDescription(newDesc);

    const chloeMsg: ChatMessage = {
      id: `msg-desc-save-${Date.now()}`,
      sender: 'chloe',
      text: `הסלוגן והתיאור של "${currentProp.hebrew_name}" עודכנו בהצלחה! ✍️\n\n• סלוגן חדש: "${newTagline}"\n• תיאור: "${newDesc}"\n\nהטקסט עודכן כעת בעמוד המתחם ומוצג בסימולטור הנייד לימינך.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actionTaken: {
        type: 'description',
        summary: `עודכן סלוגן ותיאור (${optionLabel})`
      }
    };
    setMessages((prev) => [...prev, chloeMsg]);
  };

  // =========================================================================
  // PHOTO MANAGER ACTIONS
  // =========================================================================
  const handleSetHeroPhoto = (photoUrl: string) => {
    if (!currentProp) return;

    // Ensure it is in gallery
    const newGallery = [photoUrl, ...currentProp.gallery_images.filter((img) => img !== photoUrl)];
    const updated = {
      ...currentProp,
      hero_image: photoUrl,
      gallery_images: newGallery
    };

    onUpdateProperty(updated);
    triggerPreviewPulse();

    const chloeMsg: ChatMessage = {
      id: `msg-photo-${Date.now()}`,
      sender: 'chloe',
      text: `קבעתי את התמונה הזו כתמונה הראשית של המתחם! ⭐\nמבט במסך הנייד לימינך יראה אותה ברזולוציה הגבוהה ביותר בעמוד הראשי.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actionTaken: { type: 'photo', summary: 'עודכנה תמונה ראשית חדשה' }
    };
    setMessages((prev) => [...prev, chloeMsg]);
  };

  const handleDeletePhoto = (photoUrl: string) => {
    if (!currentProp) return;

    const newGallery = currentProp.gallery_images.filter((img) => img !== photoUrl);
    let newHero = currentProp.hero_image;
    if (newHero === photoUrl) {
      newHero = newGallery[0] || CHLOE_PHOTO_LIBRARY[0].url;
    }

    const updated = {
      ...currentProp,
      hero_image: newHero,
      gallery_images: newGallery
    };

    onUpdateProperty(updated);
    triggerPreviewPulse();

    const chloeMsg: ChatMessage = {
      id: `msg-del-${Date.now()}`,
      sender: 'chloe',
      text: `התמונה נמחקה מהגלריה בהצלחה. 🗑️`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actionTaken: { type: 'photo', summary: 'תמונה הוסרה מהגלריה' }
    };
    setMessages((prev) => [...prev, chloeMsg]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentProp) return;

    const fileList = Array.from(files);
    let loadedCount = 0;
    const newUrls: string[] = [];

    fileList.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) newUrls.push(result);
        loadedCount++;

        if (loadedCount === fileList.length) {
          const updatedGallery = [...newUrls, ...currentProp.gallery_images];
          const updated = {
            ...currentProp,
            gallery_images: updatedGallery,
            hero_image: currentProp.hero_image || newUrls[0]
          };

          onUpdateProperty(updated);
          triggerPreviewPulse();

          const chloeMsg: ChatMessage = {
            id: `msg-upload-${Date.now()}`,
            sender: 'chloe',
            text: `מעולה! העלית ${fileList.length} תמונות חדשות מהטלפון/מחשב 📱\nהתמונות נוספו לגלריה ומוצגות כעת במתחם. תוכל לבחור כל אחת מהן כתמונה ראשית.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            actionTaken: { type: 'photo', summary: `נוספו ${fileList.length} תמונות חדשות מהטלפון` }
          };
          setMessages((prev) => [...prev, chloeMsg]);
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  // =========================================================================
  // AMENITIES ACTIONS
  // =========================================================================
  const handleToggleAmenity = (amenityLabel: string) => {
    if (!currentProp) return;

    const exists = currentProp.amenities.includes(amenityLabel);
    let newAmenities: string[];

    if (exists) {
      newAmenities = currentProp.amenities.filter((a) => a !== amenityLabel);
    } else {
      newAmenities = [...currentProp.amenities, amenityLabel];
    }

    const updated = { ...currentProp, amenities: newAmenities };
    onUpdateProperty(updated);
    triggerPreviewPulse();
  };

  const handleAddCustomAmenity = () => {
    const trimmed = customAmenityInput.trim();
    if (!trimmed || !currentProp) return;

    if (!currentProp.amenities.includes(trimmed)) {
      const updated = {
        ...currentProp,
        amenities: [...currentProp.amenities, trimmed]
      };
      onUpdateProperty(updated);
      triggerPreviewPulse();
    }
    setCustomAmenityInput('');
  };

  // =========================================================================
  // PRICING & POLICIES ACTIONS
  // =========================================================================
  const handleSavePricing = () => {
    if (!currentProp) return;

    const updatedUnits = (currentProp.units || []).map((u, idx) =>
      idx === 0
        ? {
            ...u,
            base_price: formBasePrice,
            weekend_price: formWeekendPrice
          }
        : u
    );

    const updated: ManagedProperty = {
      ...currentProp,
      units: updatedUnits,
      extra_child_fee: formChildFee,
      allows_pets: formAllowsPets,
      pet_fee: formAllowsPets ? formPetFee : 0,
      cleaning_fee: formCleaningFee,
      holiday_surcharge_percent: formHolidaySurcharge
    };

    onUpdateProperty(updated);
    triggerPreviewPulse();

    const summaryText = `המחירון והתוספות של "${currentProp.hebrew_name}" עודכנו בהצלחה! 💰\n• אמצע שבוע: ₪${formBasePrice} | סוף שבוע: ₪${formWeekendPrice}\n• תאריכים מיוחדים/חגים: ${formHolidaySurcharge > 0 ? '+' + formHolidaySurcharge + '%' : 'ללא תוספת'}\n• תוספת לילד: ₪${formChildFee} ללילה\n• כלבים וחיות מחמד: ${formAllowsPets ? `מותר להביא (תוספת ₪${formPetFee})` : 'ללא בעלי חיים'}\n• דמי ניקיון לשהייה: ${formCleaningFee > 0 ? `₪${formCleaningFee}` : 'ללא דמי ניקיון'}`;

    const chloeMsg: ChatMessage = {
      id: `msg-price-save-${Date.now()}`,
      sender: 'chloe',
      text: summaryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actionTaken: {
        type: 'price',
        summary: `מחירים עודכנו: ₪${formBasePrice} אמצ״ש / ₪${formWeekendPrice} סופ״ש`
      }
    };
    setMessages((prev) => [...prev, chloeMsg]);
  };

  // =========================================================================
  // NATURAL LANGUAGE / CHLOE OLLAMA AGENT PROCESSOR
  // =========================================================================
  const processHostPrompt = async (rawPrompt: string) => {
    const text = rawPrompt.trim();
    if (!text || !currentProp) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    const lower = text.toLowerCase();

    // Check if user naturally asked for a section
    if (lower.includes('תמונה') || lower.includes('תמונות') || lower.includes('גלריה')) {
      setTimeout(() => {
        handleSelectFlow('photo_manager');
        setIsTyping(false);
      }, 500);
      return;
    }

    if (lower.includes('מתקן') || lower.includes('מתקנים') || lower.includes('מאפיין') || lower.includes('מאפיינים')) {
      setTimeout(() => {
        handleSelectFlow('amenities_manager');
        setIsTyping(false);
      }, 500);
      return;
    }

    if (lower.includes('מחיר') || lower.includes('מחירים') || lower.includes('אמצ״ש') || lower.includes('סופ״ש') || lower.includes('כלב') || lower.includes('ילד') || lower.includes('ניקיון')) {
      setTimeout(() => {
        handleSelectFlow('pricing_manager');
        setIsTyping(false);
      }, 500);
      return;
    }

    if (lower.includes('תיאור') || lower.includes('סלוגן') || lower.includes('שיווקי') || lower.includes('טקסט') || lower.includes('לנסח') || lower.includes('קופירייטינג')) {
      setTimeout(() => {
        handleSelectFlow('description_review');
        setIsTyping(false);
      }, 500);
      return;
    }

    // Otherwise, attempt Ollama query or regex heuristic
    let responseText = `רשמתי את ההערה עבור ${currentProp.hebrew_name} ✨\nבמה תרצה שנעדכן כעת?`;
    let actionType: ChatMessage['actionTaken']['type'] = 'general';
    let actionSummary = '';
    let updatedProp = { ...currentProp };

    // Try Local Ollama if online
    if (isLocalOllamaOnline) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const res = await fetch('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'chloe-host',
            prompt: `המתחם: "${updatedProp.hebrew_name}" ביישוב "${updatedProp.village}". בקשת הבעלים: "${text}". עני בקצרה בעברית וספקי פעולה.`,
            stream: false
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const result = await res.json();
          if (result.response) {
            responseText = result.response.replace(/```json[\s\S]*?```/g, '').trim();
          }
        }
      } catch {
        // fallback
      }
    }

    onUpdateProperty(updatedProp);
    triggerPreviewPulse();

    const chloeMsg: ChatMessage = {
      id: `msg-chloe-${Date.now()}`,
      sender: 'chloe',
      text: responseText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actionTaken: actionSummary ? { type: actionType, summary: actionSummary } : undefined,
      widget: 'main_categories'
    };

    setMessages((prev) => [...prev, chloeMsg]);
    setIsTyping(false);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processHostPrompt(inputText);
  };

  const CHLOE_WHATSAPP_NUMBER = '972506102416';
  const propTitle = currentProp?.hebrew_name ? ` עבור ${currentProp.hebrew_name}` : '';
  const whatsappUrl = `https://wa.me/${CHLOE_WHATSAPP_NUMBER}?text=${encodeURIComponent(`היי קלואי, אני רוצה לעדכן פרטים ותמונות${propTitle} ב-ResortOS`)}`;

  // All combined photos for current property
  const allCurrentPhotos = Array.from(
    new Set([currentProp.hero_image, ...(currentProp.gallery_images || [])].filter(Boolean))
  );

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Hidden File Input for Native Camera / Photo Gallery Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Top Banner with Property Switcher & Mobile Quick Link */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-stone-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#26130F] to-[#59454A] text-[#C5A880] flex items-center justify-center font-bold shadow">
              <Bot className="w-6 h-6" />
            </div>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-[8px] text-white font-bold">
              ✓
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-[#26130F]">קלואי · מנהלת הליווי שלכם</span>
              {isLocalOllamaOnline ? (
                <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-md border border-purple-200 flex items-center gap-1 shadow-2xs">
                  <Cpu className="w-3 h-3 text-purple-600 animate-pulse" />
                  <span>סוכן מקומי פעיל ב-Studio (Qwen 3.5)</span>
                </span>
              ) : (
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>מנוע אינטראקטיבי פעיל</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-stone-500">עורכת כעת את:</span>
              <select
                value={currentProp?.id}
                onChange={(e) => onSelectProperty(e.target.value)}
                className="font-bold text-xs text-[#26130F] bg-stone-100 hover:bg-stone-200 px-2.5 py-1 rounded-lg border border-stone-200 focus:outline-none cursor-pointer"
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

        {/* Header Actions: Guidelines, WhatsApp, Live Preview, Manual Editor */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          <button
            type="button"
            onClick={() => setShowGuidelinesModal(true)}
            className="py-2.5 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold flex items-center gap-1.5 transition"
            title="צפייה בהנחיות הסוכן וה-System Prompt"
          >
            <BookOpen className="w-3.5 h-3.5 text-stone-600" />
            <span className="hidden sm:inline">הנחיות מערכת</span>
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2.5 px-3.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            title="פתיחת שיחה ישירה עם קלואי בוואטסאפ"
          >
            <MessageCircle className="w-4 h-4" />
            <span>דבר עם קלואי בוואטסאפ</span>
          </a>

          {onOpenPublicListing && (
            <button
              type="button"
              onClick={() => onOpenPublicListing(currentProp.slug)}
              className="py-2.5 px-3.5 rounded-xl bg-[#26130F] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm hover:bg-[#3F2C29] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#C5A880]" />
              <span>צפייה בדף המתחם בלייב</span>
            </button>
          )}

          {onOpenManualEditor && (
            <button
              type="button"
              onClick={onOpenManualEditor}
              className="py-2.5 px-3 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-bold flex items-center gap-1"
              title="מעבר לטפסי עריכה ידניים מלאים"
            >
              <Sliders className="w-3.5 h-3.5 text-stone-500" />
              <span className="hidden md:inline">עריכה ידנית</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Split Screen: Guided Chloe Chat (Left) + Live iPhone Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: GUIDED CHLOE AI CHAT INTERFACE (7 Cols on Desktop) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-stone-200 shadow-sm flex flex-col h-[750px] overflow-hidden">
          {/* Chat Top Banner */}
          <div className="p-4 border-b border-stone-100 bg-stone-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C5A880]" />
              <span className="text-xs font-extrabold text-[#26130F]">
                שיחה מודרכת עם קלואי · כל שינוי משתקף בלייב במסך הנייד
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-500">
              <button
                type="button"
                onClick={() => handleSelectFlow('main_categories')}
                className="hover:text-stone-900 underline transition"
              >
                תפריט ראשי
              </button>
            </div>
          </div>

          {/* Chat Messages Feed with Inline Interactive Widgets */}
          <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 bg-[#FAF8F5]/60">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                {msg.sender === 'chloe' ? (
                  <div className="w-8 h-8 rounded-xl bg-[#26130F] text-[#C5A880] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-[#C5A880] text-[#26130F] flex items-center justify-center font-black text-xs shrink-0 mt-0.5 shadow-sm">
                    אתה
                  </div>
                )}

                {/* Message Bubble Container */}
                <div
                  className={`max-w-[88%] sm:max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-[#26130F] text-white rounded-tr-none shadow-sm'
                      : 'bg-white text-stone-800 rounded-tl-none border border-stone-200/90 shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-line font-medium text-[13px]">{msg.text}</p>

                  {/* Action Summary Tag */}
                  {msg.actionTaken && (
                    <div className="mt-2.5 p-2 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-[11px] font-bold flex items-center gap-1.5 animate-fadeIn">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{msg.actionTaken.summary}</span>
                    </div>
                  )}

                  {/* ================================================================= */}
                  {/* INLINE WIDGET 1: MAIN CATEGORIES CHOOSER */}
                  {/* ================================================================= */}
                  {msg.widget === 'main_categories' && (
                    <div className="mt-3.5 space-y-2 border-t border-stone-100 pt-3">
                      <span className="text-[11px] font-bold text-stone-500 block">
                        בחר מה תרצה לעדכן:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleSelectFlow('photo_manager')}
                          className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-[#C5A880] text-right transition flex items-start gap-2.5 shadow-2xs group"
                        >
                          <span className="text-xl shrink-0 p-1 bg-white rounded-lg border border-stone-200 shadow-2xs">📸</span>
                          <div>
                            <span className="font-bold text-xs text-[#26130F] block group-hover:text-amber-800">
                              תמונות וגלריה
                            </span>
                            <span className="text-[10px] text-stone-500">
                              קביעת תמונה ראשית, מחיקה או העלאה מהטלפון
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectFlow('amenities_manager')}
                          className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-[#C5A880] text-right transition flex items-start gap-2.5 shadow-2xs group"
                        >
                          <span className="text-xl shrink-0 p-1 bg-white rounded-lg border border-stone-200 shadow-2xs">✨</span>
                          <div>
                            <span className="font-bold text-xs text-[#26130F] block group-hover:text-amber-800">
                              מאפיינים ומתקנים
                            </span>
                            <span className="text-[10px] text-stone-500">
                              נוף לים, כיריים, קמין, ג׳קוזי, בריכה ו-Wi-Fi
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectFlow('pricing_manager')}
                          className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-[#C5A880] text-right transition flex items-start gap-2.5 shadow-2xs group"
                        >
                          <span className="text-xl shrink-0 p-1 bg-white rounded-lg border border-stone-200 shadow-2xs">💰</span>
                          <div>
                            <span className="font-bold text-xs text-[#26130F] block group-hover:text-amber-800">
                              מחירים ותוספות
                            </span>
                            <span className="text-[10px] text-stone-500">
                              אמצ״ש, סופ״ש, חגים, תוספת ילדים, כלבים וניקיון
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectFlow('description_review')}
                          className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-[#C5A880] text-right transition flex items-start gap-2.5 shadow-2xs group"
                        >
                          <span className="text-xl shrink-0 p-1 bg-white rounded-lg border border-stone-200 shadow-2xs">✍️</span>
                          <div>
                            <span className="font-bold text-xs text-[#26130F] block group-hover:text-amber-800">
                              שדרוג שיווקי וסלוגן
                            </span>
                            <span className="text-[10px] text-stone-500">
                              בדיקת הטקסט הקיים, 3 גרסאות לבחירה או עריכה עצמית
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ================================================================= */}
                  {/* INLINE WIDGET 2: INTERACTIVE PHOTO MANAGER */}
                  {/* ================================================================= */}
                  {msg.widget === 'photo_manager' && (
                    <div className="mt-3.5 space-y-3 border-t border-stone-100 pt-3">
                      {/* Upload CTA Button */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-2.5 px-4 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                        >
                          <Upload className="w-4 h-4 text-[#C5A880]" />
                          <span>📱 העלאת תמונות חדשות מהטלפון או המחשב</span>
                        </button>
                      </div>

                      {/* Photo Grid */}
                      <span className="text-[11px] font-bold text-stone-600 block">
                        כל התמונות במתחם ({allCurrentPhotos.length}):
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto p-1">
                        {allCurrentPhotos.map((url, pIdx) => {
                          const isHero = url === currentProp.hero_image;
                          return (
                            <div
                              key={pIdx}
                              className={`relative group rounded-xl overflow-hidden border-2 bg-stone-100 transition-all ${
                                isHero ? 'border-amber-500 ring-2 ring-amber-400/40 shadow-md' : 'border-stone-200'
                              }`}
                            >
                              <img
                                src={url}
                                alt={`תמונה ${pIdx + 1}`}
                                className="w-full h-24 object-cover"
                              />

                              {/* Hero Badge */}
                              {isHero && (
                                <div className="absolute top-1.5 right-1.5 bg-amber-500 text-stone-950 font-black text-[9px] px-2 py-0.5 rounded-full shadow flex items-center gap-1">
                                  <Star className="w-2.5 h-2.5 fill-current" />
                                  <span>ראשית</span>
                                </div>
                              )}

                              {/* Action Overlay */}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                                {!isHero && (
                                  <button
                                    type="button"
                                    onClick={() => handleSetHeroPhoto(url)}
                                    className="p-1.5 bg-white hover:bg-amber-400 text-stone-900 rounded-lg text-[10px] font-bold shadow transition"
                                    title="קבע כתמונה ראשית"
                                  >
                                    קבע כראשית
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeletePhoto(url)}
                                  className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold shadow transition"
                                  title="מחק תמונה זו"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Preset High-Res Photo Recommendations */}
                      <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
                        <span className="text-[10px] font-bold text-stone-600 block">
                          הוספה מהירה מתמונות פרימיום מומלצות של ResortOS:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {CHLOE_PHOTO_LIBRARY.map((item, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSetHeroPhoto(item.url)}
                              className="text-[10px] bg-white hover:bg-amber-50 hover:border-amber-400 border border-stone-200 px-2 py-1 rounded-lg text-stone-700 font-bold transition flex items-center gap-1"
                            >
                              <span>+</span>
                              <span>{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Return button */}
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSelectFlow('main_categories')}
                          className="text-[11px] font-bold text-stone-500 hover:text-stone-900 underline"
                        >
                          חזרה לאפשרויות הראשיות ⬅️
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ================================================================= */}
                  {/* INLINE WIDGET 3: INTERACTIVE AMENITIES CHECKLIST */}
                  {/* ================================================================= */}
                  {msg.widget === 'amenities_manager' && (
                    <div className="mt-3.5 space-y-4 border-t border-stone-100 pt-3">
                      {/* Section 1: ALL ACTIVE AMENITIES - FULL VIEW WITHOUT CUTOFF */}
                      <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-2xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-black text-emerald-950">
                              מאפיינים פעילים כרגע באתר ({currentProp.amenities.length} פעילים - כולם מסומנים בירוק ✓):
                            </span>
                          </div>
                          <span className="text-[10px] text-emerald-800 font-bold bg-white px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                            מוצגים לאורחים
                          </span>
                        </div>

                        {currentProp.amenities.length === 0 ? (
                          <p className="text-xs text-stone-500 italic py-1">
                            טרם הוגדרו מאפיינים. בחרו מההצעות למטה או הוסיפו מאפיין מותאם אישית.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {currentProp.amenities.map((amenityLabel, aIdx) => (
                              <button
                                key={`${amenityLabel}-${aIdx}`}
                                type="button"
                                onClick={() => handleToggleAmenity(amenityLabel)}
                                className="py-2 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-emerald-600 hover:bg-red-600 text-white border border-emerald-700 hover:border-red-700 shadow-sm cursor-pointer group"
                                title={`לחץ להסרת "${amenityLabel}" מהמתחם`}
                              >
                                <span className="text-sm">{getAmenityIcon(amenityLabel)}</span>
                                <span className="leading-tight">{amenityLabel}</span>
                                <Check className="w-3.5 h-3.5 text-white group-hover:hidden" />
                                <X className="w-3.5 h-3.5 text-white hidden group-hover:block" />
                              </button>
                            ))}
                          </div>
                        )}
                        <p className="text-[10px] text-emerald-800/80 pt-0.5 font-medium">
                          💡 כל {currentProp.amenities.length} המאפיינים למעלה מסומנים בירוק ומופיעים באתר. לחיצה על מאפיין ירוק תסיר אותו מיד (✕).
                        </p>
                      </div>

                      {/* Section 2: SUGGESTED AMENITIES TO ADD WITH 1-CLICK */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-stone-600 block">
                          הוסף מאפיינים פופולריים נוספים בלחיצה אחת:
                        </span>
                        <div className="flex flex-wrap gap-1.5 p-0.5">
                          {CANONICAL_AMENITIES.filter(
                            (amenity) => !isAmenityCovered(amenity, currentProp.amenities)
                          ).map((amenity) => (
                            <button
                              key={amenity.id}
                              type="button"
                              onClick={() => handleToggleAmenity(amenity.label)}
                              className="py-1.5 px-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 text-stone-700 border border-stone-200 shadow-2xs"
                            >
                              <span>{amenity.icon}</span>
                              <span>{amenity.label}</span>
                              <Plus className="w-3 h-3 text-stone-400" />
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Section 3: Add Custom Amenity Input */}
                      <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center gap-2">
                        <input
                          type="text"
                          value={customAmenityInput}
                          onChange={(e) => setCustomAmenityInput(e.target.value)}
                          placeholder="הוסף מאפיין מותאם אישית (למשל: 'שולחן סנוקר', 'פינת מדורה', 'טאבון')..."
                          className="flex-1 p-2 text-xs bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomAmenity}
                          disabled={!customAmenityInput.trim()}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition shadow-2xs"
                        >
                          הוסף
                        </button>
                      </div>

                      {/* Return button */}
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSelectFlow('main_categories')}
                          className="text-[11px] font-bold text-stone-500 hover:text-stone-900 underline"
                        >
                          חזרה לאפשרויות הראשיות ⬅️
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ================================================================= */}
                  {/* INLINE WIDGET 4: INTERACTIVE PRICING, DATES & EXTRAS */}
                  {/* ================================================================= */}
                  {msg.widget === 'pricing_manager' && (
                    <div className="mt-3.5 space-y-3.5 border-t border-stone-100 pt-3">
                      {/* Section 1: Base Rates */}
                      <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                        <span className="text-[11px] font-bold text-stone-700 block flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                          <span>מחירים קבועים ללילה</span>
                        </span>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {/* Weekday Price */}
                          <div className="space-y-1">
                            <label className="text-[10px] text-stone-500 font-bold block">
                              📅 אמצע שבוע (אמצ״ש):
                            </label>
                            <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg px-2 py-1">
                              <span className="text-xs font-bold text-stone-400">₪</span>
                              <input
                                type="number"
                                value={formBasePrice}
                                onChange={(e) => setFormBasePrice(Number(e.target.value))}
                                className="w-full text-xs font-bold text-stone-900 focus:outline-none"
                              />
                            </div>
                            <div className="flex gap-1 flex-wrap pt-0.5">
                              {[750, 850, 950, 1100].map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => setFormBasePrice(amt)}
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold border transition ${
                                    formBasePrice === amt ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-stone-600 border-stone-200'
                                  }`}
                                >
                                  ₪{amt}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Weekend Price */}
                          <div className="space-y-1">
                            <label className="text-[10px] text-stone-500 font-bold block">
                              🌴 סוף שבוע (סופ״ש):
                            </label>
                            <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg px-2 py-1">
                              <span className="text-xs font-bold text-stone-400">₪</span>
                              <input
                                type="number"
                                value={formWeekendPrice}
                                onChange={(e) => setFormWeekendPrice(Number(e.target.value))}
                                className="w-full text-xs font-bold text-stone-900 focus:outline-none"
                              />
                            </div>
                            <div className="flex gap-1 flex-wrap pt-0.5">
                              {[1100, 1250, 1400, 1600].map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => setFormWeekendPrice(amt)}
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold border transition ${
                                    formWeekendPrice === amt ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-stone-600 border-stone-200'
                                  }`}
                                >
                                  ₪{amt}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Special Dates & High Season */}
                      <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
                        <span className="text-[11px] font-bold text-stone-700 block flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-amber-600" />
                          <span>תאריכים מיוחדים ועונות שיא (חגים / יולי-אוגוסט)</span>
                        </span>
                        <div className="flex gap-1.5 flex-wrap">
                          {[
                            { pct: 0, label: '0% (מחיר רגיל)' },
                            { pct: 15, label: '+15% תוספת' },
                            { pct: 20, label: '+20% חגים' },
                            { pct: 30, label: '+30% שיא עונה' }
                          ].map((item) => (
                            <button
                              key={item.pct}
                              type="button"
                              onClick={() => setFormHolidaySurcharge(item.pct)}
                              className={`text-[10px] px-2 py-1 rounded-lg font-bold border transition ${
                                formHolidaySurcharge === item.pct
                                  ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                                  : 'bg-white text-stone-600 border-stone-200'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Section 3: Add-ons & Policies (Kids, Pets, Cleaning) */}
                      <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2.5">
                        <span className="text-[11px] font-bold text-stone-700 block flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                          <span>תוספות אירוח ומדיניות</span>
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          {/* Child Fee */}
                          <div className="bg-white p-2 rounded-lg border border-stone-200 space-y-1">
                            <span className="text-[10px] font-bold text-stone-600 block">👶 תוספת ילד (ללילה):</span>
                            <div className="flex items-center gap-1">
                              <span className="text-stone-400 text-xs">₪</span>
                              <input
                                type="number"
                                value={formChildFee}
                                onChange={(e) => setFormChildFee(Number(e.target.value))}
                                className="w-full text-xs font-bold text-stone-900 focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* Pet Policy */}
                          <div className="bg-white p-2 rounded-lg border border-stone-200 space-y-1">
                            <span className="text-[10px] font-bold text-stone-600 block">🐶 אירוח כלבים:</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setFormAllowsPets(!formAllowsPets)}
                                className={`text-[10px] px-2 py-0.5 rounded font-bold border w-full transition ${
                                  formAllowsPets
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-black'
                                    : 'bg-stone-100 text-stone-500 border-stone-200'
                                }`}
                              >
                                {formAllowsPets ? '🐕 מותר (₪' + formPetFee + ')' : '🚫 ללא כלבים'}
                              </button>
                            </div>
                            {formAllowsPets && (
                              <div className="flex items-center gap-1 pt-1">
                                <span className="text-[9px] text-stone-500">תוספת: ₪</span>
                                <input
                                  type="number"
                                  value={formPetFee}
                                  onChange={(e) => setFormPetFee(Number(e.target.value))}
                                  className="w-12 text-[10px] font-bold border rounded px-1"
                                />
                              </div>
                            )}
                          </div>

                          {/* Cleaning Fee */}
                          <div className="bg-white p-2 rounded-lg border border-stone-200 space-y-1">
                            <span className="text-[10px] font-bold text-stone-600 block">🧹 דמי ניקיון לשהייה:</span>
                            <div className="flex items-center gap-1">
                              <span className="text-stone-400 text-xs">₪</span>
                              <input
                                type="number"
                                value={formCleaningFee}
                                onChange={(e) => setFormCleaningFee(Number(e.target.value))}
                                className="w-full text-xs font-bold text-stone-900 focus:outline-none"
                              />
                            </div>
                            <span className="text-[9px] text-stone-400 block">חד פעמי לשהייה</span>
                          </div>
                        </div>
                      </div>

                      {/* Save Pricing Button */}
                      <button
                        type="button"
                        onClick={handleSavePricing}
                        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>💾 שמור ועדכן מחירון ותוספות באתר</span>
                      </button>

                      {/* Return button */}
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSelectFlow('main_categories')}
                          className="text-[11px] font-bold text-stone-500 hover:text-stone-900 underline"
                        >
                          חזרה לאפשרויות הראשיות ⬅️
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ================================================================= */}
                  {/* INLINE WIDGET 5: CURRENT DESCRIPTION REVIEW & FLOW CHOICE */}
                  {/* ================================================================= */}
                  {msg.widget === 'description_review' && (
                    <div className="mt-3.5 space-y-3 border-t border-stone-100 pt-3">
                      {/* Current Status Card */}
                      <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200/80 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                            <span>📌</span>
                            <span>הסלוגן והתיאור המעודכנים כרגע במתחם:</span>
                          </span>
                          <span className="text-[9px] bg-white text-stone-600 px-1.5 py-0.5 rounded border border-amber-200 font-mono">
                            מוצג כעת באתר
                          </span>
                        </div>

                        <div className="bg-white p-2.5 rounded-lg border border-amber-200/60 space-y-1">
                          <span className="text-[10px] font-bold text-stone-500 block">סלוגן נוכחי:</span>
                          <span className="font-black text-stone-900 block text-xs">
                            "{currentProp.tagline || 'לא הוגדר עדיין סלוגן'}"
                          </span>
                        </div>

                        <div className="bg-white p-2.5 rounded-lg border border-amber-200/60 space-y-1">
                          <span className="text-[10px] font-bold text-stone-500 block">תיאור מפורט נוכחי:</span>
                          <p className="text-stone-700 leading-relaxed text-[11px] whitespace-pre-line font-medium">
                            {currentProp.description || 'לא הוגדר עדיין תיאור'}
                          </p>
                        </div>
                      </div>

                      {/* Prompt Question */}
                      <span className="text-[11px] font-bold text-stone-700 block">
                        האם תרצה שקלואי תציע לך גרסה שיווקית חדשה או שתעדיף לערוך ולנסח בעצמך?
                      </span>

                      {/* 2 Choices */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleSelectFlow('description_options')}
                          className="p-3 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white text-right font-bold text-xs flex items-center justify-between shadow transition group"
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-[#C5A880]" />
                            <span>הציעי לי 3 גרסאות שיווקיות לבחירה</span>
                          </div>
                          <span className="text-[#C5A880] group-hover:translate-x-[-2px] transition-transform">←</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectFlow('description_options')}
                          className="p-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-right font-bold text-xs border border-stone-300 flex items-center justify-between transition"
                        >
                          <div className="flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-stone-600" />
                            <span>אני רוצה לערוך ולנסח בעצמי</span>
                          </div>
                          <span className="text-stone-500">✏️</span>
                        </button>
                      </div>

                      {/* Return button */}
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSelectFlow('main_categories')}
                          className="text-[11px] font-bold text-stone-500 hover:text-stone-900 underline"
                        >
                          חזרה לתפריט הראשי ⬅️
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ================================================================= */}
                  {/* INLINE WIDGET 6: 3 AI MARKETING SUGGESTIONS + 4TH SELF-EDIT OPTION */}
                  {/* ================================================================= */}
                  {msg.widget === 'description_options' && (
                    <div className="mt-3.5 space-y-3.5 border-t border-stone-100 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-stone-700">
                          3 הצעות שיווקיות מנצחות (בחר אחת בלחיצה):
                        </span>
                        <span className="text-[10px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          סגנונות שונים
                        </span>
                      </div>

                      {/* 3 AI Suggested Options */}
                      <div className="space-y-2.5">
                        {/* Option 1: Luxury & Romance */}
                        <div className="p-3 rounded-xl border border-stone-200 bg-stone-50/80 hover:bg-white hover:border-[#C5A880] transition space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">💎</span>
                              <span className="font-black text-xs text-[#26130F]">אפשרות 1: סגנון יוקרה, בוטיק ורומנטיקה</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleApplyDescription(
                                `חופשת בוטיק יוקרתית ב${currentProp.village} עם פרטיות מוחלטת ונוף עוצר נשימה`,
                                `מתחם בוטיק מבודד, יוקרתי ושקט ב${currentProp.village}. סוויטות פרימיום מעוצבות ברמה הגבוהה ביותר עם בריכת שחייה פרטית, ג׳קוזי ספא חיצוני מול השקיעה, מכונת נספרסו ופינוקים ללא פשרות. הזמנה ישירה ללא עמלות תיווך.`,
                                'יוקרה ובוטיק'
                              )}
                              className="px-3 py-1 bg-[#26130F] hover:bg-[#3F2C29] text-[#C5A880] font-bold text-[11px] rounded-lg shadow transition flex items-center gap-1"
                            >
                              <span>בחר גרסה זו ⭐</span>
                            </button>
                          </div>
                          <div className="bg-white p-2.5 rounded-lg border border-stone-200/70 text-xs space-y-1">
                            <span className="font-bold text-stone-900 block text-[11px]">
                              סלוגן: "חופשת בוטיק יוקרתית ב{currentProp.village} עם פרטיות מוחלטת ונוף עוצר נשימה"
                            </span>
                            <p className="text-stone-600 text-[10px] leading-relaxed">
                              מתחם בוטיק מבודד, יוקרתי ושקט ב{currentProp.village}. סוויטות פרימיום מעוצבות ברמה הגבוהה ביותר עם בריכת שחייה פרטית, ג׳קוזי ספא חיצוני מול השקיעה, מכונת נספרסו ופינוקים ללא פשרות. הזמנה ישירה ללא עמלות תיווך.
                            </p>
                          </div>
                        </div>

                        {/* Option 2: Nature & Serenity */}
                        <div className="p-3 rounded-xl border border-stone-200 bg-stone-50/80 hover:bg-white hover:border-[#C5A880] transition space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">🌿</span>
                              <span className="font-black text-xs text-[#26130F]">אפשרות 2: סגנון טבע, שלווה ונוף גלילי פסטורלי</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleApplyDescription(
                                `פסק זמן מושלם בטבע הפסטורלי של ${currentProp.village} מול נופים פתוחים`,
                                `ברוכים הבאים לפינת שלווה קסומה ב${currentProp.village}. בקתות עץ חמימות, מרפסת דק מול נוף פתוח, בריכה מרעננת, ג׳קוזי חם ואוויר הרים צלול. המקום המושלם למלא מצברים בשקט, רוגע ואינטימיות ב-0% עמלת תיווך.`,
                                'טבע ושלווה'
                              )}
                              className="px-3 py-1 bg-[#26130F] hover:bg-[#3F2C29] text-[#C5A880] font-bold text-[11px] rounded-lg shadow transition flex items-center gap-1"
                            >
                              <span>בחר גרסה זו ⭐</span>
                            </button>
                          </div>
                          <div className="bg-white p-2.5 rounded-lg border border-stone-200/70 text-xs space-y-1">
                            <span className="font-bold text-stone-900 block text-[11px]">
                              סלוגן: "פסק זמן מושלם בטבע הפסטורלי של {currentProp.village} מול נופים פתוחים"
                            </span>
                            <p className="text-stone-600 text-[10px] leading-relaxed">
                              ברוכים הבאים לפינת שלווה קסומה ב{currentProp.village}. בקתות עץ חמימות, מרפסת דק מול נוף פתוח, בריכה מרעננת, ג׳קוזי חם ואוויר הרים צלול. המקום המושלם למלא מצברים בשקט, רוגע ואינטימיות ב-0% עמלת תיווך.
                            </p>
                          </div>
                        </div>

                        {/* Option 3: Family & Fun / Hospitality */}
                        <div className="p-3 rounded-xl border border-stone-200 bg-stone-50/80 hover:bg-white hover:border-[#C5A880] transition space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">🏊‍♂️</span>
                              <span className="font-black text-xs text-[#26130F]">אפשרות 3: סגנון חווייתי עשיר בפינוקים למשפחות וזוגות</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleApplyDescription(
                                `מתחם הנופש האידיאלי לזוגות ולמשפחות ב${currentProp.village}`,
                                `חופשה בלתי נשכחת ב${currentProp.village} עם כל הפינוקים במקום אחד: בריכה מחוממת, ג׳קוזי ספא ענק, עמדת מנגל BBQ מקצועית, מטבח מאובזר ומקסימום מרחב ופרטיות. אירוח כפרי חם ומפנק. סגירה ישירה מול המארח.`,
                                'משפחתי וחווייתי'
                              )}
                              className="px-3 py-1 bg-[#26130F] hover:bg-[#3F2C29] text-[#C5A880] font-bold text-[11px] rounded-lg shadow transition flex items-center gap-1"
                            >
                              <span>בחר גרסה זו ⭐</span>
                            </button>
                          </div>
                          <div className="bg-white p-2.5 rounded-lg border border-stone-200/70 text-xs space-y-1">
                            <span className="font-bold text-stone-900 block text-[11px]">
                              סלוגן: "מתחם הנופש האידיאלי לזוגות ולמשפחות ב{currentProp.village}"
                            </span>
                            <p className="text-stone-600 text-[10px] leading-relaxed">
                              חופשה בלתי נשכחת ב{currentProp.village} עם כל הפינוקים במקום אחד: בריכה מחוממת, ג׳קוזי ספא ענק, עמדת מנגל BBQ מקצועית, מטבח מאובזר ומקסימום מרחב ופרטיות. אירוח כפרי חם ומפנק. סגירה ישירה מול המארח.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Option 4: Manual Self-Editing Form (אפשרות רביעית: ערוך לבד) */}
                      <div className="p-3.5 bg-white rounded-2xl border-2 border-emerald-600/60 shadow-sm space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                            <span>✏️</span>
                            <span>אפשרות 4: עריכה וניסוח עצמי חופשי</span>
                          </div>
                          <span className="text-[10px] text-stone-400">מותאם אישית</span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-stone-600 block">סלוגן שיווקי קצר:</label>
                          <input
                            type="text"
                            value={manualTagline}
                            onChange={(e) => setManualTagline(e.target.value)}
                            placeholder="למשל: בקתת עץ מבודדת מול נוף הכנרת..."
                            className="w-full p-2 text-xs bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-stone-900"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-stone-600 block">תיאור מפורט ומזמין של המתחם:</label>
                          <textarea
                            rows={3}
                            value={manualDescription}
                            onChange={(e) => setManualDescription(e.target.value)}
                            placeholder="תאר את המתחם, האווירה, הבריכה, הפינוקים והנוף..."
                            className="w-full p-2 text-xs bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed text-stone-800"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleApplyDescription(manualTagline, manualDescription, 'עריכה עצמית')}
                          className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>💾 שמור ועדכן תיאור מותאם אישית באתר</span>
                        </button>
                      </div>

                      {/* Return button */}
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSelectFlow('main_categories')}
                          className="text-[11px] font-bold text-stone-500 hover:text-stone-900 underline"
                        >
                          חזרה לאפשרויות הראשיות ⬅️
                        </button>
                      </div>
                    </div>
                  )}

                  <span
                    className={`block text-[9px] mt-1.5 text-left ${
                      msg.sender === 'user' ? 'text-stone-300' : 'text-stone-400'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2.5 items-center text-xs text-stone-500 italic p-2 bg-white rounded-xl border border-stone-200 w-fit">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C5A880]" />
                <span>קלואי מעדכנת את המתחם...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Quick Guided Category Buttons above input */}
          <div className="p-2.5 bg-white border-t border-stone-100 flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] font-bold text-stone-400 shrink-0 mr-1">קיצורים:</span>
            <button
              type="button"
              onClick={() => handleSelectFlow('photo_manager')}
              className="py-1 px-2.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-700 text-[11px] font-bold border border-stone-200 transition shrink-0 flex items-center gap-1"
            >
              <span>📸</span>
              <span>תמונות וגלריה</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectFlow('amenities_manager')}
              className="py-1 px-2.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-700 text-[11px] font-bold border border-stone-200 transition shrink-0 flex items-center gap-1"
            >
              <span>✨</span>
              <span>מאפיינים ומתקנים</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectFlow('pricing_manager')}
              className="py-1 px-2.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-700 text-[11px] font-bold border border-stone-200 transition shrink-0 flex items-center gap-1"
            >
              <span>💰</span>
              <span>מחירים ותוספות</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectFlow('description_review')}
              className="py-1 px-2.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-700 text-[11px] font-bold border border-stone-200 transition shrink-0 flex items-center gap-1"
            >
              <span>✍️</span>
              <span>שיווק וסלוגן</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="py-1 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200 transition shrink-0 flex items-center gap-1"
            >
              <span>📱</span>
              <span>העלאת תמונה מהטלפון</span>
            </button>
          </div>

          {/* Free Text Input Box */}
          <form onSubmit={handleFormSubmit} className="p-3.5 bg-white border-t border-stone-200 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="או כתוב לקלואי בחופשיות (למשל: 'תחליפי תמונה לבריכה' או 'תעלי מחיר ל-1200')..."
              className="flex-1 p-3 rounded-xl border border-stone-300 text-xs font-medium focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-3 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white shadow disabled:opacity-40 transition-all"
              title="שלח לקלואי"
            >
              <Send className="w-4 h-4 text-[#C5A880]" />
            </button>
          </form>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: LIVE MOBILE SIMULATOR PREVIEW (5 Cols on Desktop) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 flex flex-col items-center">
          {/* Mobile Phone Mockup Chassis */}
          <div
            className={`w-full max-w-[340px] bg-[#1a1a1a] p-3.5 rounded-[44px] shadow-2xl border-4 border-stone-800 relative transition-all duration-700 ${
              previewPulse ? 'ring-4 ring-emerald-500 ring-offset-2 scale-[1.01]' : ''
            }`}
          >
            {/* Top Speaker & Camera Dynamic Island */}
            <div className="w-28 h-4.5 bg-black rounded-full mx-auto mb-2 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-stone-900 border border-stone-700 mr-2" />
            </div>

            {/* Screen Viewport */}
            <div className="bg-[#FDFBF7] rounded-[32px] overflow-hidden border border-stone-700/40 text-[#26130F] flex flex-col h-[670px] overflow-y-auto">
              {/* Phone Status Bar */}
              <div className="px-5 pt-3 pb-1 flex items-center justify-between text-[10px] font-bold text-stone-500 bg-white border-b border-stone-100 shrink-0">
                <span>09:41</span>
                <span className="flex items-center gap-1 font-mono">
                  <span>5G</span>
                  <span>100%</span>
                </span>
              </div>

              {/* Live Property Showcase */}
              <div className="p-3.5 space-y-3">
                {/* Hero Photo Card */}
                <div className="relative h-44 rounded-2xl overflow-hidden shadow-sm">
                  <img
                    src={currentProp?.hero_image || '/resorts/placeholder_luxury.jpg'}
                    alt={currentProp?.hebrew_name}
                    className="w-full h-full object-cover transition-all duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  
                  <div className="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur-md text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-white/20">
                    <MapPin className="w-2.5 h-2.5 text-[#C5A880]" />
                    <span>{currentProp?.village}</span>
                  </div>

                  <div className="absolute bottom-2.5 right-2.5 left-2.5 text-white">
                    <span className="text-[9px] text-[#C5A880] font-bold block">{currentProp?.tagline}</span>
                    <h3 className="text-base font-black leading-tight">{currentProp?.hebrew_name}</h3>
                    <span className="text-[10px] text-stone-200 font-mono font-bold">
                      החל מ-₪{currentProp?.units?.[0]?.base_price || 850} / לילה
                    </span>
                  </div>
                </div>

                {/* Policies & Extras Badges */}
                <div className="flex flex-wrap gap-1">
                  {currentProp?.allows_pets && (
                    <span className="text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <span>🐶</span>
                      <span>ידידותי לכלבים {currentProp.pet_fee ? `(₪${currentProp.pet_fee})` : '(חינם)'}</span>
                    </span>
                  )}
                  {Boolean(currentProp?.extra_child_fee) && (
                    <span className="text-[9px] font-bold bg-blue-50 text-blue-900 border border-blue-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <span>👶</span>
                      <span>תוספת ילד: ₪{currentProp.extra_child_fee}</span>
                    </span>
                  )}
                  {Boolean(currentProp?.cleaning_fee) && (
                    <span className="text-[9px] font-bold bg-stone-100 text-stone-800 border border-stone-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <span>🧹</span>
                      <span>ניקיון: ₪{currentProp.cleaning_fee}</span>
                    </span>
                  )}
                  {Boolean(currentProp?.holiday_surcharge_percent) && (
                    <span className="text-[9px] font-bold bg-rose-50 text-rose-900 border border-rose-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <span>🌴</span>
                      <span>חגים: +{currentProp.holiday_surcharge_percent}%</span>
                    </span>
                  )}
                </div>

                {/* Amenities Pills */}
                <div>
                  <span className="text-[10px] font-bold text-stone-400 block mb-1.5">
                    מתקנים ומאפיינים ({currentProp?.amenities?.length || 0}):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(currentProp?.amenities || []).slice(0, 6).map((amenity, aIdx) => (
                      <span
                        key={aIdx}
                        className="text-[9px] font-bold bg-white border border-stone-200 px-2 py-0.5 rounded-md text-stone-700 shadow-2xs"
                      >
                        {amenity}
                      </span>
                    ))}
                    {(currentProp?.amenities || []).length > 6 && (
                      <span className="text-[9px] font-bold text-stone-400 self-center">
                        +{(currentProp?.amenities || []).length - 6}
                      </span>
                    )}
                  </div>
                </div>

                {/* Units & Pricing Preview */}
                <div className="p-3 bg-white rounded-xl border border-stone-200/80 shadow-2xs space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span>{currentProp?.units?.[0]?.name || 'סוויטה ראשית'}</span>
                    <span className="text-emerald-700 font-mono">
                      ₪{currentProp?.units?.[0]?.base_price || 850} / אמצ״ש
                    </span>
                  </div>
                  <div className="text-[10px] text-stone-500 flex items-center justify-between">
                    <span>סופ״ש: ₪{currentProp?.units?.[0]?.weekend_price || 1100}</span>
                    <span>עד {currentProp?.units?.[0]?.max_occupancy || 4} אורחים</span>
                  </div>
                </div>

                {/* Gallery Thumbnails */}
                {currentProp?.gallery_images?.length > 1 && (
                  <div>
                    <span className="text-[10px] font-bold text-stone-400 block mb-1">גלריה:</span>
                    <div className="flex gap-1 overflow-x-auto pb-1">
                      {currentProp.gallery_images.slice(0, 4).map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt="גלריה"
                          className="w-14 h-11 rounded-lg object-cover border border-stone-200 shrink-0"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Description Excerpt */}
                <div className="text-[10px] text-stone-600 leading-relaxed bg-stone-50 p-2.5 rounded-xl border border-stone-200/60 line-clamp-2">
                  {currentProp?.description}
                </div>

                {/* Guest Direct Booking CTA Button */}
                <div className="space-y-1.5 pt-1">
                  <button
                    type="button"
                    className="w-full py-2.5 px-3 rounded-xl bg-[#25D366] text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>בירור זמינות ישיר בוואטסאפ</span>
                  </button>

                  <div className="flex items-center justify-center gap-1 text-[9px] text-stone-400 font-medium">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>0% עמלת תיווך · סגירה ישירה מול המארח</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Caption beneath phone */}
          <div className="mt-3 text-center">
            <span className="text-xs font-bold text-stone-600 flex items-center justify-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-[#C5A880]" />
              <span>תצוגה מקדימה חיה של מסך הנייד</span>
            </span>
            <span className="text-[10px] text-stone-400">
              כל שינוי בתמונות, במאפיינים או במחירים מתעדכן כאן מיידית
            </span>
          </div>
        </div>
      </div>

      {/* Guidelines & System Prompt Modal */}
      {showGuidelinesModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">הנחיות מערכת ו-System Prompt לסוכן</h3>
                  <p className="text-[11px] text-stone-500">עבור קלואי (Chloe), סוכנת ה-AI המקומית ב-Mac Studio</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuidelinesModal(false)}
                className="w-8 h-8 rounded-full bg-stone-200 hover:bg-stone-300 flex items-center justify-center text-stone-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-stone-700 leading-relaxed font-sans">
              {/* Status Banner */}
              <div className="p-3.5 rounded-2xl bg-stone-900 text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isLocalOllamaOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                  <span className="font-bold text-xs">
                    {isLocalOllamaOnline ? 'סוכן מקומי מחובר ב-Mac Studio (פורט 11434)' : 'מצב המתנה / מנוע דפדפן פעיל'}
                  </span>
                </div>
                <span className="text-[10px] text-stone-400 font-mono">מודל: chloe-host (Qwen 3.5)</span>
              </div>

              {/* Prompt Box */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-stone-800 text-xs">ה-System Prompt הרשמי של קלואי:</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(
`את קלואי (Chloe), סוכנת ה-AI המבצעית, מנהלת הליווי ועוזרת הניהול האישית של בעלי מתחמי הנופש, הצימרים והריזורטים בצפון בפלטפורמת ResortOS.

0. אבטחה ואימות בעלות קודם לכל (Ownership Verification Gate):
   - בכל פנייה ראשונה או אינטראקציה לעדכון מתחם, חובה לוודא אימות בעלות מלא מול מספר הטלפון המורשה של המתחם או באמצעות קוד אימות חד-פעמי (OTP) בווטסאפ (WATI) / SMS.
   - אין לבצע שינוי מחירים, פתיחת יומן להזמנות ישירות או החלפת פרטים לפני שזהות בעל המתחם אומתה במערכת.

תפקידך וסמכויותייך:
1. לסייע לבעלי המתחמים המאומתים לעדכן בקלות ובמהירות את פרטי המתחם שלהם באמצעות שפה טבעית בעברית:
   - מחירי אמצ״ש וסופ״ש
   - תמונות ראשיות וגלריה (התאמת תמונות בריכה, סוויטה, ג'קוזי, נוף כנרת)
   - מתקנים ומאפיינים (מכונת נספרסו, ג׳קוזי ספא חיצוני, בריכה מחוממת, עמדת טעינה לרכב חשמלי, כשרות)
   - כתיבה שיווקית: סלוגן יוקרתי ותיאור עשיר ומזמין שמבליט את היתרונות של הצפון
   - פרטי Wi-Fi והגדרות חוויית אורח / מדריך חדר דיגיטלי
2. סגנון שיחה ותקשורת:
   - עברית טבעית, שירותית, חמה, מקצועית וממוקדת.
   - בלי מונחים טכניים מסובכים — לתת לבעל הצימר הרגשה של מנהלת אירוח אישית שמטפלת בהכל.
3. מבנה פלט חובה:
   בכל פעם שבעל המתחם מבקש עדכון, יש לתת מענה שירותי בעברית ובסוף ההודעה להוסיף תמיד בלוק JSON יחיד ומדויק מסוג \`\`\`json ... \`\`\` עם הפעולה המבוקשת.`
                      );
                      setCopiedGuidelines(true);
                      setTimeout(() => setCopiedGuidelines(false), 2000);
                    }}
                    className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition"
                  >
                    {copiedGuidelines ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-stone-500" />}
                    <span>{copiedGuidelines ? 'הועתק!' : 'העתקת פרומפט'}</span>
                  </button>
                </div>
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 font-mono text-[11px] leading-relaxed text-stone-800 max-h-48 overflow-y-auto whitespace-pre-wrap">
{`את קלואי (Chloe), סוכנת ה-AI המבצעית ועוזרת הניהול של בעלי מתחמי הנופש ב-ResortOS.
0. חובה לאמת בעלות מול טלפון מורשה / OTP בוואטסאפ או SMS לפני כל ביצוע שינוי.
1. תפקידך: לעדכן מחירים, תמונות, מתקנים, תיאורים ו-Wi-Fi.
2. לענות בעברית חמה ושירותית, ולפלוט בסוף בלוק JSON עם action ו-data.`}
                </div>
              </div>

              {/* Terminal instructions for Mac Studio */}
              <div>
                <span className="font-bold text-stone-800 text-xs block mb-1.5 flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-stone-600" />
                  <span>הרצה ישירה בטרמינל של ה-Studio:</span>
                </span>
                <div className="p-3 bg-stone-900 text-emerald-400 rounded-xl font-mono text-[11px] leading-normal space-y-1">
                  <div># הפעלת שיחה עם קלואי בטרמינל:</div>
                  <div className="text-white font-bold">ollama run chloe-host</div>
                  <div className="pt-1 text-stone-400"># בדיקת API מקומי:</div>
                  <div className="text-stone-300">curl -s http://127.0.0.1:11434/api/generate -d '&#123;"model":"chloe-host","prompt":"תעדכני מחיר ל-1200","stream":false&#125;'</div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-stone-100 bg-stone-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuidelinesModal(false)}
                className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl transition"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
