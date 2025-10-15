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
    brand: { marketplace: 'වෙළඳසැල' },
    nav: { home: 'මුල් පිටුව', sell: 'විකින්න', jobs: 'සේවා', myAds: 'මගේ දැන්වීම්', account: 'ගිණුම' },
    notifications: { title: 'දැනුම්දීම්', close: 'වසන්න', markAllRead: 'සියල්ල කියවූ ලෙස සැකසන්න', new: 'නව' },
    footer: { policy: 'සේවා ප්‍රතිපත්තිය', copyright: year => `© ${year} Ganudenu වෙළඳසැල` },
    home: {
      heroTitle: 'ගන්න • විකින්න • රැකියා',
      heroSubtitle: 'වಾಹන, දේපළ, රැකියා, ඉලෙක්ට්‍රොනික, ජංගම දුරකථන සහ නිවස & උද්යානය සඳහා වට්ටම් සොයන්න.',
      searchPlaceholder: 'කිසිවක් සොයන්න (උදා: ටයොටා, මහනුවර නිවසක්, ගණකකරු)...',
      searchButton: 'සෙවීම',
      filters: 'පෙරණ',
      hideFilters: 'පෙරණ සඟවන්න',
      latestListings: 'නවතම දැන්වීම්',
      categoryListings: cat => `${cat} දැන්වීම්`
    },
    features: {
      sectionTitle: 'අපගේ විශේෂාංග',
      aiCategoriesTitle: '🤖 AI කාණ්ඩ',
      aiCategoriesDesc: 'ඔබගේ දැන්වීම සඳහා වඩාත් සුදුසු ප්‍රධාන කාණ්ඩය සහ උප-කාණ්ඩය AI විසින් ස්වයංක්‍රීයව තෝරයි.',
      aiDescriptionsTitle: '✍️ AI විස්තර',
      aiDescriptionsDesc: 'එක ඔබුවීමෙන් ලස්සන විස්තර; බුලට් ලැයිස්තු සහ emoji සමඟ පැහැදිලිව.',
      advancedFiltersTitle: '🧭 ප්‍රගතිශීලී පෙරණ',
      advancedFiltersDesc: 'ඔබට අවශ්‍ය දේ ඉක්මනින් සොයන්න සකස් කළ හොඳ පෙරණ.',
      futuristicUiTitle: '🚀 නවීන UI',
      futuristicUiDesc: 'සියලුම උපාංගවල වේගවත්, සුන්දර පෙනුම සහ අත්දැකීම.',
      sriLankanTitle: '🇱🇺 100% ශ්‍රී ලාංකීය',
      sriLankanDesc: 'දේශීය අවබෝධය සහ සරලතාව සමඟ නිර්මාණය කර ඇත.',
      lowCostTitle: '💸 අඩු වියදම්',
      lowCostDesc: 'වියදම් අඩු කරමින් වැඩි පිරිසක් වෙත ළඟා වන්න.',
      autoFacebookTitle: '🔗 ස්වයං Facebook (ඉක්මනින්)',
      autoFacebookDesc: 'ප්‍රකාශයට පසු ඔබගේ FB පිටුවට ස්වයංක්‍රීයව සෑදීම සහ බෙදා හැරීම.',
      allInOneTitle: '🧩 එකම වේදිකාව',
      allInOneDesc: 'ගන්න, විකින්න, රැකියා — එකම තැනක.'
    },
    common: { language: 'භාෂාව' }
  },
  ta: {
    brand: { marketplace: 'மார்க்கெட்' },
    nav: { home: 'முகப்பு', sell: 'விற்பனை', jobs: 'வேலைகள்', myAds: 'என் விளம்பரங்கள்', account: 'கணக்கு' },
    notifications: { title: 'அறிவிப்புகள்', close: 'மூடு', markAllRead: 'அனைத்தையும் படித்ததாக குறி', new: 'புது' },
    footer: { policy: 'சேவை கொள்கை', copyright: year => `© ${year} Ganudenu மார்க்கெட்` },
    home: {
      heroTitle: 'கொள் • வில் • வேலை',
      heroSubtitle: 'வாகனங்கள், சொத்து, வேலைகள், எலக்ட்ரானிக்ஸ், மொபைல்கள் மற்றும் வீடு & தோட்டத்தில் சிறந்த சலுகைகள்.',
      searchPlaceholder: 'ஏதாவது தேடு (எ.கா., டொயோட்டா, கண்டியில் வீடு, கணக்காளர்)...',
      searchButton: 'தேடு',
      filters: 'வடிகட்டிகள்',
      hideFilters: 'வடிகட்டிகள் மறை',
      latestListings: 'சமீபத்திய பட்டியல்கள்',
      categoryListings: cat => `${cat} பட்டியல்கள்`
    },
    features: {
      sectionTitle: 'எங்கள் அம்சங்கள்',
      aiCategoriesTitle: '🤖 AI பிரிவுகள்',
      aiCategoriesDesc: 'உங்கள் விளம்பரத்திற்கு சிறந்த முக்கிய பிரிவு மற்றும் துணைப் பிரிவை AI தானாகத் தேர்ந்தெடுக்கிறது.',
      aiDescriptionsTitle: '✍️ AI விளக்கங்கள்',
      aiDescriptionsDesc: 'ஒரு கிளிக்கில் அழகான விளக்கம்; புள்ளிகள் மற்றும் எமோஜியுடன் தெளிவு.',
      advancedFiltersTitle: '🧭 மேம்பட்ட வடிகட்டிகள்',
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