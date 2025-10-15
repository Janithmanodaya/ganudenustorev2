import React, { createContext, useContext, useMemo } from 'react'

const dictionaries = {
  en: {
    brand: { marketplace: 'Marketplace' },
    nav: { home: 'Home', sell: 'Sell', jobs: 'Jobs', myAds: 'My Ads', account: 'Account' },
    notifications: { title: 'Notifications', close: 'Close', markAllRead: 'Mark all read', new: 'New' },
    footer: { policy: 'Service Policy', copyright: year => `© ${year} Ganudenu Marketplace` },
    home: {
      heroTitle: 'Buy • Sell • Hire',
      heroSubtitle: 'Discover great deals on vehicles, property, jobs, electronics, mobiles, and home & garden.',
      searchPlaceholder: 'Search anything (e.g., Toyota, House in Kandy, Accountant)...',
      searchButton: 'Search',
      filters: 'Filters',
      hideFilters: 'Hide Filters',
      latestListings: 'Latest listings',
      categoryListings: cat => `${cat} listings`
    },
    features: {
      sectionTitle: 'Our Features',
      aiCategoriesTitle: '🤖 AI Categories',
      aiCategoriesDesc: 'AI auto-selects the best main category and sub-category for your ad.',
      aiDescriptionsTitle: '✍️ AI Descriptions',
      aiDescriptionsDesc: 'One-click, polished descriptions with bullets and emoji for clarity.',
      advancedFiltersTitle: '🧭 Advanced Filters',
      advancedFiltersDesc: 'Powerful, easy filters to find exactly what you need fast.',
      futuristicUiTitle: '🚀 Futuristic UI',
      futuristicUiDesc: 'Clean, modern, and fast experience across devices.',
      sriLankanTitle: '🇱🇰 100% Sri Lankan',
      sriLankanDesc: 'Built for Sri Lanka with local insights and simplicity.',
      lowCostTitle: '💸 Low Cost',
      lowCostDesc: 'Keep costs down while reaching more buyers and sellers.',
      autoFacebookTitle: '🔗 Auto Facebook (Soon)',
      autoFacebookDesc: 'Auto-create and auto-share to your FB page after publish.',
      allInOneTitle: '🧩 All-in-one',
      allInOneDesc: 'Everything you need to buy, sell, and hire — in one place.'
    },
    common: { language: 'Language' }
  },
  si: {
    brand: { marketplace: 'වෙළඳමධ්‍යස්ථානය' },
    nav: { home: 'මුල් පිටුව', sell: 'විකුණන්න', jobs: 'රැකියා', myAds: 'මගේ දැන්වීම්', account: 'ගිණුම' },
    notifications: { title: 'දැනුම්දීම්', close: 'වසන්න', markAllRead: 'සියල්ල කියවූ ලෙස සැකසන්න', new: 'නව' },
    footer: { policy: 'සේවා ප්‍රතිපත්තිය', copyright: year => `© ${year} Ganudenu වෙළඳමධ්‍යස්ථානය` },
    home: {
      heroTitle: 'ගන්න • විකුණන්න • රැකියා සොයන්න',
      heroSubtitle: 'වාහන, දේපළ, රැකියා, ඉලෙක්ට්‍රොනික, ජංගම දුරකථන සහ නිවස & උද්‍යානය සඳහා හොඳ ගනුදෙනු සොයන්න.',
      searchPlaceholder: 'කිසිවක් සොයන්න (උදා: ටයොටා, මහනුවර නිවසක්, ගණකකරු)...',
      searchButton: 'සොයන්න',
      filters: 'පෙරහන්',
      hideFilters: 'පෙරහන් සඟවන්න',
      latestListings: 'නවතම දැන්වීම්',
      categoryListings: cat => `${cat} දැන්වීම්`
    },
    features: {
      sectionTitle: 'විශේෂාංග ටික බලන්න', // Rewritten
      aiCategoriesTitle: '🤖 AI Category එක', // Rewritten
      aiCategoriesDesc: 'ඔබේ Ad එකට ගැලපෙන Main Category, Sub-Category එක AI වලින් Auto Select කරනවා.', // Rewritten
      aiDescriptionsTitle: '✍️ AI Description', // Rewritten
      aiDescriptionsDesc: 'එක Click එකකින්, Bullets, Emoji එක්ක පැහැදිලි ආකර්ශනීය Description එකක් හදන්න.', // Rewritten
      advancedFiltersTitle: '🧭 Advanced Filters', // Rewritten
      advancedFiltersDesc: 'ඔබට ඕන දේ ඉක්මනින්ම හොයාගන්න, Powerfull Filters පාවිච්චි කරන්න.', // Rewritten
      futuristicUiTitle: '🚀 Super Fast UI/UX', // Rewritten
      futuristicUiDesc: 'ඕනෑම Device එකක Super Fast, Attractive Design එකක්.', // Rewritten
      sriLankanTitle: '🇱🇰 100% ශ්‍රී ලාංකීය',
      sriLankanDesc: 'දේශීය අවබෝධය සහ සරලතාව සමඟ නිර්මාණය කර ඇත.',
      lowCostTitle: '💸 Low Cost Pricing', // Rewritten
      lowCostDesc: 'වියදම් අඩු කරමින් වැඩි පිරිසක් වෙත ළඟා වන්න.', // Rewritten
      autoFacebookTitle: '🔗 Auto Facebook Share ', // Rewritten
      autoFacebookDesc: 'Automatically ඔයාගේ Ad එක Facebook එකේ Share කරගන්න.',
      allInOneTitle: '🧩 All-in-One Platform', // Rewritten
      allInOneDesc: 'ගන්න, විකුණන්න, රැකියා — එකම තැනක.'
    },
    common: { language: 'භාෂාව' }
  },
  ta: {
    brand: { marketplace: 'சந்தைக்களம்' },
    nav: { home: 'முகப்பு', sell: 'விற்க', jobs: 'வேலைகள்', myAds: 'எனது விளம்பரங்கள்', account: 'கணக்கு' },
    notifications: { title: 'அறிவிப்புகள்', close: 'மூடு', markAllRead: 'அனைத்தையும் படித்ததாக குறி', new: 'புது' },
    footer: { policy: 'சேவை கொள்கை', copyright: year => `© ${year} Ganudenu சந்தைக்களம்` },
    home: {
      heroTitle: 'வாங்க • விற்க • வேலை தேட',
      heroSubtitle: 'வாகனங்கள், சொத்து, வேலைகள், எலக்ட்ரானிக்ஸ், மொபைல்கள் மற்றும் வீடு & தோட்டத்தில் சிறந்த ஒப்பந்தங்கள்.',
      searchPlaceholder: 'ஏதாவது தேடு (எ.கா., டொயோட்டா, கண்டியில் வீடு, கணக்காளர்)...',
      searchButton: 'தேடுக',
      filters: 'வடிகட்டிகள்',
      hideFilters: 'வடிகட்டிகளை மறை',
      latestListings: 'சமீபத்திய அறிவிப்புகள்',
      categoryListings: cat => `${cat} பட்டியல்கள்`
    },
    features: {
      sectionTitle: 'எங்கள் அம்சங்கள்',
      aiCategoriesTitle: '🤖 AI பிரிவுகள்',
      aiCategoriesDesc: 'உங்கள் விளம்பரத்திற்கு சிறந்த முக்கிய பிரிவு மற்றும் துணைப் பிரிவை AI தானாகத் தேர்ந்தெடுக்கிறது.',
      aiDescriptionsTitle: '✍️ AI விளக்கங்கள்',
      aiDescriptionsDesc: 'ஒரு கிளிக்கில் அழகான விளக்கம்; புள்ளிகள் மற்றும் எமோஜியுடன் தெளிவு.',
      advancedFiltersTitle: '🧭 மேம்பட்ட வடிகட்டி',
      advancedFiltersDesc: 'உங்களுக்கு தேவையானதை விரைவாகக் கண்டுபிடிக்க சக்திவாய்ந்த வடிகட்டிகள்.',
      futuristicUiTitle: '🚀 நவீன UI',
      futuristicUiDesc: 'அனைத்து சாதனங்களிலும் வேகம், அழகு மற்றும் சிறந்த அனுபவம்.',
      sriLankanTitle: '🇱🇰 100% இலங்கை',
      sriLankanDesc: 'உள்ளூர் நுணுக்கங்களும் எளிமையும் கொண்ட உருவாக்கம்.',
      lowCostTitle: '💸 குறைந்த செலவு',
      lowCostDesc: 'செலவுகளை குறைத்தபடி அதிகம் சென்றடையுங்கள்.',
      autoFacebookTitle: '🔗 தானியங்கி Facebook (விரைவில்)',
      autoFacebookDesc: 'வெளியீட்டிற்கு பின் உங்கள் FB பக்கத்தில் தானாக உருவாக்கி பகிர்கிறது.',
      allInOneTitle: '🧩 அனைத்தும் ஒன்றில்',
      allInOneDesc: 'கொள்வதும், விற்பதும், வேலைகளும் — அனைத்தும் ஒரே இடத்தில்.'
    },
    common: { language: 'மொழி' }
  }
}

const I18nContext = createContext({ lang: 'en', t: (path, params) => path })

export function I18nProvider({ lang = 'en', children }) {
  const dict = dictionaries[lang] || dictionaries.en
  const t = useMemo(() => {
    return (path, params) => {
      try {
        const parts = String(path).split('.')
        let cur = dict
        for (const p of parts) {
          if (cur && typeof cur[p] !== 'undefined') cur = cur[p]
          else { cur = null; break }
        }
        if (cur == null) return path
        if (typeof cur === 'function') return cur(params)
        return String(cur)
      } catch (_) {
        return path
      }
    }
  }, [dict])
  return <I18nContext.Provider value={{ lang, t }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
