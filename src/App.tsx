import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Register from './pages/Register';
import Card from './pages/Card';
import VerifyAndScan from './pages/VerifyAndScan';
import SkillTest from './pages/SkillTest';
import Review from './pages/Review';
import PublicProfile from './pages/Profile';
import MapNearby from './pages/MapNearby';
import Auth from './pages/Auth';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/register" element={<Register />} />
          <Route path="/card" element={<Card />} />
          <Route path="/scan" element={<VerifyAndScan />} />
          <Route path="/cosign" element={<Navigate to="/scan?tab=verify" replace />} />
          <Route path="/map" element={<MapNearby />} />
          <Route path="/skill-test" element={<SkillTest />} />
          <Route path="/review" element={<Review />} />
          <Route path="/p/:handle" element={<PublicProfile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
