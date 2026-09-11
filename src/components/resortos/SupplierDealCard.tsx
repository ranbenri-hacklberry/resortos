import React, { useState } from 'react';
import { Tag, Copy, Check, Lock, Sparkles, MessageCircle, ShieldCheck, ExternalLink } from 'lucide-react';

export interface B2BDealItem {
  id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_category: string;
  category_label?: string;
  supplier_whatsapp?: string;
  supplier_badge?: string;
  title: string;
  description: string;
  discount_percentage?: number | null;
  fixed_discount_cents?: number | null;
  coupon_code: string;
  min_order_cents?: number | null;
  requires_prime: boolean;
  banner_image?: string | null;
}

export interface SupplierDealCardProps {
  deal: B2BDealItem;
  hostTier?: 'free_directory' | 'resortos_prime_99' | 'cabinos_prime_99' | 'enterprise_vip';
  onUpgradeToPrime?: (deal: B2BDealItem) => void;
  className?: string;
}

export const SupplierDealCard: React.FC<SupplierDealCardProps> = ({
  deal,
  hostTier = 'free_directory',
  onUpgradeToPrime,
  className = ''
}) => {
  const [copied, setCopied] = useState(false);

  const isPrimeUser = hostTier === 'resortos_prime_99' || hostTier === 'cabinos_prime_99' || hostTier === 'enterprise_vip';
  const isLocked = deal.requires_prime && !isPrimeUser;

  const handleCopy = () => {
    if (isLocked) return;
    navigator.clipboard.writeText(deal.coupon_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const discountText = deal.discount_percentage
    ? `${deal.discount_percentage}% הנחה`
    : deal.fixed_discount_cents
    ? `₪${(deal.fixed_discount_cents / 100).toLocaleString()} הנחה`
    : 'הטבה בלעדית';

  const supplierPhone = deal.supplier_whatsapp ? deal.supplier_whatsapp.replace(/\D/g, '') : '';
  const waInquiry = encodeURIComponent(
    `שלום, אני מארח ב-ResortOS וראיתי את ההטבה שלכם (${deal.title}) עם קוד קופון ${deal.coupon_code}. אשמח לקבל הצעת מחיר.`
  );
  const waUrl = supplierPhone ? `https://wa.me/${supplierPhone}?text=${waInquiry}` : null;

  return (
    <div
      className={`bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group ${className}`}
    >
      {/* Prime Exclusive Ribbon */}
      {deal.requires_prime && (
        <div className="absolute top-0 left-0 bg-gradient-to-r from-[#C5A880] to-[#b8986c] text-[#26130F] text-[10px] font-black uppercase px-3 py-0.5 rounded-br-xl flex items-center gap-1 shadow-sm">
          <Sparkles className="w-3 h-3" />
          <span>בלעדי ל-ResortOS Prime</span>
        </div>
      )}

      {/* Top Details */}
      <div className={deal.requires_prime ? 'pt-2' : ''}>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">
            {deal.category_label || deal.supplier_category}
          </span>

          <span className="text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-lg">
            {discountText}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium mb-1">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>{deal.supplier_name}</span>
          {deal.supplier_badge && <span className="text-[10px] text-stone-400">({deal.supplier_badge})</span>}
        </div>

        <h3 className="font-bold text-sm sm:text-base text-[#26130F] leading-snug mb-2 group-hover:text-[#8C6239] transition-colors">
          {deal.title}
        </h3>

        <p className="text-xs text-stone-600 leading-relaxed mb-4">{deal.description}</p>
      </div>

      {/* Action Footer */}
      <div className="pt-4 border-t border-stone-100 space-y-2.5">
        {isLocked ? (
          <button
            type="button"
            onClick={() => onUpgradeToPrime?.(deal)}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#26130F] via-[#3F2C29] to-[#59454A] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <Lock className="w-3.5 h-3.5 text-[#C5A880] shrink-0" />
            <span>שחרור קוד קופון בלעדי (שדרוג ל-Prime ב-₪99)</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-stone-50 border border-stone-200 p-2 rounded-xl flex items-center justify-between px-3">
              <span className="text-[10px] text-stone-400 font-medium">קוד קופון:</span>
              <span className="font-mono font-black text-xs sm:text-sm text-[#26130F] tracking-wider">
                {deal.coupon_code}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="py-2.5 px-3.5 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white text-xs font-bold flex items-center gap-1.5 shadow transition-all hover:scale-105 active:scale-95"
              title="העתק קוד קופון"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">הועתק!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#C5A880]" />
                  <span>העתק</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* WhatsApp direct contact for the supplier */}
        {waUrl && !isLocked && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-1.5 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-[11px] font-bold flex items-center justify-center gap-1.5 border border-emerald-200 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>פנייה ישירה לספק בוואטסאפ למימוש</span>
          </a>
        )}
      </div>
    </div>
  );
};
