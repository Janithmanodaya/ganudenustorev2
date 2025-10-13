import React from 'react'
import { Routes, Route, Link, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import ViewListingPage from './pages/ViewListingPage.jsx'
import NewListingPage from './pages/NewListingPage.jsx'
import VerifyListingPage from './pages/VerifyListingPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import AuthPage from './pages/AuthPage.jsx'
import JobPortalPage from './pages/JobPortalPage.jsx'
import PostEmployeeAdPage from './pages/PostEmployeeAdPage.jsx'
import SearchResultsPage from './pages/SearchResultsPage.jsx'
import VerifyEmployeePage from './pages/VerifyEmployeePage.jsx'
import MyAdsPage from './pages/MyAdsPage.jsx'
import AccountPage from './pages/AccountPage.jsx'
import JobSearchResultsPage from './pages/JobSearchResultsPage.jsx'

export default function App() {
  return (
    <div className="app light">
      <header className="topbar">
        <div className="brand">
          <Link to="/">Ganudenu</Link>
          <span className="domain">Marketplace</span>
        </div>
        <nav className="nav">
          <Link to="/">Home</Link>
          <Link to="/new">Sell</Link>
          <Link to="/jobs">Jobs</Link>
          <Link to="/my-ads">My Ads</Link>
          <Link to="/account">Account</Link>
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/listing/:id" element={<ViewListingPage />} />
          <Route path="/new" element={<NewListingPage />} />
          <Route path="/verify" element={<VerifyListingPage />} />
          <Route path="/verify-employee" element={<VerifyEmployeePage />} />
          <Route path="/janithmanodya" element={<AdminPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/my-ads" element={<MyAdsPage />} />
          <Route path="/jobs" element={<JobPortalPage />} />
          <Route path="/jobs/search" element={<JobSearchResultsPage />} />
          <Route path="/jobs/post-employee" element={<PostEmployeeAdPage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <small>© {new Date().getFullYear()} Ganudenu Marketplace</small>
      </footer>
    </div>
  )
}