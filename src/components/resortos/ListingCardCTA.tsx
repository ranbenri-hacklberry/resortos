import React from 'react';
import { MessageCircle, Calendar, ShieldCheck, Sparkles, KeyRound } from 'lucide-react';

export interface PropertyItem {
  id: string;
  slug: string;
  name: string;
  hebrew_name: string;
  village: string;
  region: string;
  whatsapp_number: string;
  phone?: string;
  contact_name?: string;
  claimed_status: 'unclaimed_seeded' | 'claim_pending' | 'claimed_verified';
  direct_booking_enabled: boolean;
  min_price?: number;
  hero_image?: string | null;
  is_public?: boolean;
  crm_status?: 'Lead_Identified' | 'Portal_Free_Active' | 'Upsell_Pitch_Sent' | 'Verified_Subscriber' | 'Opt_Out';
  isPreviewMode?: boolean;
}

export interface ListingCardCTAProps {
  property: PropertyItem;
  onOpenBookingModal?: (property: PropertyItem) => void;
  onClaimListing?: (property: PropertyItem) => void;
  onUploadPhotos?: (property: PropertyItem) => void;
  isPreviewMode?: boolean;
  className?: string;
}

export const ListingCardCTA: React.FC<ListingCardCTAProps> = ({
  property,
  onOpenBookingModal,
  onClaimListing,
  onUploadPhotos,
  isPreviewMode = false,
  className = ''
}) => {
  const isHostPreview = isPreviewMode || property.isPreviewMode || property.is_public === false;
  const isClaimedAndConnected =
    property.claimed_status === 'claimed_verified' && property.direct_booking_enabled;

  if (isClaimedAndConnected) {
    const cleanPhone = (property.whatsapp_number || '972548076123').replace(/\D/g, '');
    const waPhone = cleanPhone.startsWith('972') ? cleanPhone : '972' + cleanPhone.replace(/^0/, '');
    const waText = encodeURIComponent(
      `שלום מיאליס ריזורטס, אשמח לברר זמינות ומחיר עבור ${property.hebrew_name} (${property.village}).`
    );

    return (
      <div className={`flex flex-col gap-2 w-full ${className}`}>
        <button
          type="button"
          onClick={() => onOpenBookingModal?.(property)}
          className="w-full py-3 px-4 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Calendar className="w-4 h-4 text-[#C5A880] shrink-0" />
          <span>בדיקת זמינות וסגירה מיידית</span>
          <span className="bg-[#C5A880] text-[#26130F] text-[10px] font-black px-1.5 py-0.5 rounded leading-none">
            0% עמלה
          </span>
        </button>

        <div className="flex items-center justify-between gap-2">
          <a
            href={`https://wa.me/${waPhone}?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center gap-1.5 border border-emerald-200/80 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>הזמנה מהירה בוואטסאפ</span>
          </a>

          <div className="flex items-center gap-1 text-[11px] text-stone-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>יומן ישיר ומאובטח</span>
          </div>
        </div>
      </div>
    );
  }

  // Fallback Direct WhatsApp Flow
  const cleanPhone = (property.whatsapp_number || '972548076123').replace(/\D/g, '');
  const inquiryText = encodeURIComponent(
    `שלום, ראיתי את ${property.hebrew_name} ב-${property.village} ואשמח לבדוק זמינות ומחיר לתאריכים הקרובים.`
  );
  const whatsappUrl = `https://wa.me/${cleanPhone.startsWith('972') ? cleanPhone : '972' + cleanPhone.replace(/^0/, '')}?text=${inquiryText}`;

  return (
    <div className={`flex flex-col gap-2 w-full ${className}`}>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-3 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        <MessageCircle className="w-4 h-4 shrink-0" />
        <span>בירור זמינות ישיר בוואטסאפ</span>
      </a>
    </div>
  );
};
