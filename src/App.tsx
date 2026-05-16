import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Register from './pages/Register';
import Card from './pages/Card';
import CoSign from './pages/CoSign';
import SkillTest from './pages/SkillTest';
import Review from './pages/Review';
import PublicProfile from './pages/Profile';
import ScanProfile from './pages/ScanProfile';
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
          <Route path="/cosign" element={<CoSign />} />
          <Route path="/scan" element={<ScanProfile />} />
          <Route path="/skill-test" element={<SkillTest />} />
          <Route path="/review" element={<Review />} />
          <Route path="/p/:handle" element={<PublicProfile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
