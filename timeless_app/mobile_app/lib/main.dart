import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  runApp(const TimelessApp());
}

class TimelessApp extends StatelessWidget {
  const TimelessApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Timeless Editorial',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFC9A96E),
          surface: const Color(0xFFF7F3EE),
        ),
        textTheme: GoogleFonts.interTextTheme(),
      ),
      home: const AuthWrapper(),
    );
  }
}

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (snapshot.hasData) {
          return const HomeView();
        }
        return const LoginView();
      },
    );
  }
}

class LoginView extends StatelessWidget {
  const LoginView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Timeless',
              style: GoogleFonts.playfairDisplay(
                fontSize: 42,
                fontWeight: FontWeight.w600,
                letterSpacing: 2.0,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'EDITORIAL',
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                letterSpacing: 4.0,
                color: const Color(0xFFC9A96E),
              ),
            ),
            const SizedBox(height: 60),
            ElevatedButton(
              onPressed: () {
                // Implementar Google Sign In
                // Por ahora usamos un login anónimo o simulado para desarrollo
                FirebaseAuth.instance.signInAnonymously();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF141210),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('Entrar a la Biblioteca'),
            ),
          ],
        ),
      ),
    );
  }
}

class HomeView extends StatelessWidget {
  const HomeView({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(
            backgroundColor: const Color(0xFFF7F3EE),
            title: Text(
              'Timeless',
              style: GoogleFonts.playfairDisplay(
                fontWeight: FontWeight.w600,
                letterSpacing: 1.2,
              ),
            ),
            centerTitle: true,
            actions: [
              IconButton(
                onPressed: () => FirebaseAuth.instance.signOut(),
                icon: const Icon(Icons.logout_outlined),
              ),
            ],
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              child: Text(
                'Tu Colección',
                style: GoogleFonts.playfairDisplay(
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          StreamBuilder<QuerySnapshot>(
            // Escuchamos las obras generadas por este usuario
            stream: FirebaseFirestore.instance
                .collection('obras')
                .where('userId', isEqualTo: user?.uid)
                .snapshots(),
            builder: (context, snapshot) {
              if (snapshot.hasError) return const SliverToBoxAdapter(child: Center(child: Text('Error al cargar')));
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const SliverToBoxAdapter(child: Center(child: CircularProgressIndicator()));
              }

              final docs = snapshot.data?.docs ?? [];

              if (docs.isEmpty) {
                return const SliverFillRemaining(
                  child: Center(child: Text('No tienes obras aún. Genera una en la web.')),
                );
              }

              return SliverPadding(
                padding: const EdgeInsets.all(20),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 0.6,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 24,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final data = docs[index].data() as Map<String, dynamic>;
                      return BookCard(
                        title: data['title'] ?? 'Sin título',
                        author: data['author'] ?? 'Timeless Agent',
                        coverUrl: data['cover'],
                      );
                    },
                    childCount: docs.length,
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class BookCard extends StatelessWidget {
  final String title;
  final String author;
  final String? coverUrl;

  const BookCard({
    super.key,
    required this.title,
    required this.author,
    this.coverUrl,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        // Navegar al Lector
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFFEDE8E0),
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.15),
                    blurRadius: 10,
                    offset: const Offset(0, 5),
                  ),
                ],
                image: coverUrl != null
                    ? DecorationImage(
                        image: NetworkImage(coverUrl!),
                        fit: BoxFit.cover,
                      )
                    : null,
              ),
              child: coverUrl == null
                  ? const Center(
                      child: Icon(Icons.book_outlined, size: 40, color: Color(0xFFA07840)),
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.playfairDisplay(
              fontWeight: FontWeight.w600,
              fontSize: 16,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            author,
            style: GoogleFonts.playfairDisplay(
              fontStyle: FontStyle.italic,
              fontSize: 13,
              color: Colors.grey[600],
            ),
          ),
        ],
      ),
    );
  }
}
